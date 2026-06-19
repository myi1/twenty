import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconCheck,
  IconDeviceFloppy,
  IconMail,
  IconPlus,
  IconSparkles,
  IconTestPipe,
  IconUsers,
} from 'twenty-ui/display';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import {
  BUILDER_MERGE_FIELDS,
  dubaiLocalToIso,
  envelopeMessage,
  LISTING_MERGE_FIELDS,
  type FormatAction,
} from '@/propel/lib/campaignBuilderConfig';
import { type MergeField, parseTemplate } from '@/propel/lib/campaignRenderer';
import {
  previewTemplateBody,
  renderParams,
  WA_PREVIEW_SAMPLES,
} from '@/propel/lib/waTemplateRenderer';
import { AbTestPanel } from '@/propel/components/campaign/AbTestPanel';
import { GrapesEmailBuilder } from '@/propel/components/campaign/GrapesEmailBuilder';
import { type GrapesEmailAiContext } from '@/propel/components/campaign/grapesEmailTypes';
import { GuardrailsCard } from '@/propel/components/campaign/GuardrailsCard';
import { SegmentCreateModal } from '@/propel/components/campaign/SegmentCreateModal';
import {
  type AbConfig,
  type AiPlan,
  type CampaignBuilderHubPayload,
  type CampaignEditResponse,
  type CapPreview,
  DEFAULT_AB_CONFIG,
  type DraftCopyResponse,
  type SaveCampaignResponse,
  type SegmentOption,
  type SaveSegmentResponse,
  type SegmentPreviewResponse,
  type SendRequestResponse,
  type SendRulesPayload,
  type TestSendResponse,
  type WaTemplateOption,
} from '@/propel/types/campaignBuilder';

export const WIZARD_STEPS = ['Setup', 'Compose', 'Audience', 'Review'] as const;

// Heuristic: did the body come from the GrapesJS designer (compiled HTML) rather
// than being hand-typed markdown? The designer emits a full <!doctype/<html> /
// <table>-based document, so a leading doctype/html/table tag is a reliable tell.
// Used only to show the right hint in the Compose step (the send drain itself
// doesn't branch on this yet — see the HTML-body note in state).
const isLikelyHtml = (s: string): boolean =>
  /^\s*<(?:!doctype|html|table|div|mjml)/i.test(s);

// The manual campaign wizard (single-message). Owns ALL campaign state and wires
// every route: draft-copy (AI assist), save-campaign (DRAFT upsert + schedule),
// segment-preview / save-segment / import-segment (Audience), test-send and
// send-request (Review). Ported field-for-field from the Propel in-sandbox
// BuilderSheet, rebuilt on real Mantine controls (Select/Popover/Modal/native
// datetime) — the payoff of graduating off the front-component sandbox.
export const ManualWizard = ({
  hub,
  initialPlan,
  initialDraft,
  onDone,
  onEditRules,
}: {
  hub: CampaignBuilderHubPayload;
  initialPlan?: AiPlan | null;
  // S6 — a DRAFT loaded via /marketing/campaign-edit to re-edit in place
  // (listing-aware: a listing-backed draft re-hydrates the listing + re-runs the
  // permit gate, rather than routing read-only). Mutually exclusive with
  // initialPlan in practice (a fresh AI plan vs an existing draft).
  initialDraft?: CampaignEditResponse | null;
  onDone: () => void;
  // S3 — opens the send-rules editor from the Review guardrails card. Optional
  // so existing callers (and tests) don't break; the card hides "Edit rules"
  // when absent.
  onEditRules?: () => void;
}) => {
  const notify = usePropelToast();

  // ── campaign state ─────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'EMAIL' | 'WHATSAPP'>('EMAIL');
  const [objective, setObjective] = useState<'SEGMENT' | 'LISTING'>('SEGMENT');
  const [listingId, setListingId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [language, setLanguage] = useState<'EN' | 'AR'>('EN');
  const [waTemplateId, setWaTemplateId] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [createdSegments, setCreatedSegments] = useState<SegmentOption[]>([]);
  const [segmentModalOpen, setSegmentModalOpen] = useState(false);
  const [steer, setSteer] = useState('');
  const [permitWarning, setPermitWarning] = useState<string | null>(null);
  const [genState, setGenState] = useState<'idle' | 'generating' | 'failed'>(
    'idle',
  );
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent'>(
    'idle',
  );
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [livePreview, setLivePreview] = useState<{
    estimate: number;
    description: string;
  } | null>(null);
  // S7 — when the estimate was last counted (epoch ms), set on a successful
  // "Refresh estimate". Drives the honest "counted ~Xm ago · recounts at send"
  // note so the moving number reads as freshness, not a bug.
  const [previewedAt, setPreviewedAt] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // S3 — the real cap-skip count for the Review guardrails (how many of THIS
  // audience already hit their weekly cap). Resolved by /marketing/segment-preview
  // with rulesPreview:true — the same cap pass the materializer runs at fire time.
  const [capPreview, setCapPreview] = useState<CapPreview>({ state: 'idle' });

  const subjectRef = useRef<HTMLInputElement | null>(null);

  // ── A/B test slice (S2) ────────────────────────────────────────────────────
  // Kept as ONE orthogonal slice (an AbConfig object) rather than scattered
  // fields, so it composes cleanly into save-campaign and so future slices
  // (S4–S9) don't have to thread half a dozen booleans through props.
  const [ab, setAb] = useState<AbConfig>(DEFAULT_AB_CONFIG);
  const subjectBRef = useRef<HTMLInputElement | null>(null);
  const bodyBRef = useRef<HTMLTextAreaElement | null>(null);
  const patchAb = useCallback(
    (patch: Partial<AbConfig>) => setAb((prev) => ({ ...prev, ...patch })),
    [],
  );

  // ── derived picker data ────────────────────────────────────────────────────
  const segments = hub.segments ?? [];
  const listings = hub.listings ?? [];
  const waTemplates = hub.waTemplates ?? [];
  const customFields = hub.customFields ?? [];
  const sendRules = hub.sendRules; // S3 — undefined when the route omitted it

  const approvedTemplates = useMemo(
    () => waTemplates.filter((t) => t.approved),
    [waTemplates],
  );
  const customKeys = useMemo(
    () => customFields.map((cf) => cf.key),
    [customFields],
  );
  const segmentSafeEmailKeys = useMemo(
    () => new Set<string>([...BUILDER_MERGE_FIELDS, ...customKeys]),
    [customKeys],
  );

  const allSegments = useMemo<SegmentOption[]>(
    () => [
      ...createdSegments,
      ...segments.filter((s) => !createdSegments.some((cs) => cs.id === s.id)),
    ],
    [createdSegments, segments],
  );
  const segment = useMemo(
    () => allSegments.find((s) => s.id === segmentId) ?? null,
    [allSegments, segmentId],
  );
  const listing = useMemo(
    () => listings.find((l) => l.id === listingId) ?? null,
    [listings, listingId],
  );
  // S9 — compliance block: a listing promo whose Trakheesi permit isn't valid.
  // Gates "Send now" (the send-request route re-checks it server-side anyway);
  // saving a draft / scheduling is still allowed (the permit is re-checked at
  // fire time, and the draft is useful while the permit clears).
  const permitBlocked =
    objective === 'LISTING' &&
    channel === 'EMAIL' &&
    listing != null &&
    !listing.permitOk;

  const listingFieldsActive =
    objective === 'LISTING' && Boolean(listingId) && channel === 'EMAIL';
  const composeMergeFields = useMemo<MergeField[]>(
    () =>
      listingFieldsActive
        ? [...BUILDER_MERGE_FIELDS, ...LISTING_MERGE_FIELDS]
        : BUILDER_MERGE_FIELDS,
    [listingFieldsActive],
  );
  const composeAllowedKeys = useMemo(
    () =>
      listingFieldsActive
        ? new Set<string>([...segmentSafeEmailKeys, ...LISTING_MERGE_FIELDS])
        : segmentSafeEmailKeys,
    [listingFieldsActive, segmentSafeEmailKeys],
  );
  // The email live-preview sample maps were removed with the inline EmailPreview —
  // the GrapesJS builder's own canvas is the preview now.

  // ── hydrate from an AI plan handoff (once) ─────────────────────────────────
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!initialPlan || hydratedRef.current) return;
    hydratedRef.current = true;
    setChannel(initialPlan.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL');
    setLanguage(initialPlan.language === 'AR' ? 'AR' : 'EN');
    if (initialPlan.subject) setSubject(initialPlan.subject);
    if (initialPlan.body) setBodyText(initialPlan.body);
    if (initialPlan.whatsappTemplateId)
      setWaTemplateId(initialPlan.whatsappTemplateId);
    setName(
      initialPlan.subject?.trim()
        ? initialPlan.subject
        : `AI campaign — ${(initialPlan.segmentDescription ?? '').slice(0, 50)}`,
    );
  }, [initialPlan]);

  // ── S6 — hydrate from an existing DRAFT (campaign-edit handoff, once) ───────
  // Listing-aware: a draft carrying a listingId re-hydrates the listing and sets
  // objective=LISTING, which makes listingFieldsActive true and re-runs the
  // permit gate (the derived `listing.permitOk` + the Compose/Review permit
  // warning) — instead of the old read-only escape hatch. A/B config is restored
  // too, so reopening a draft never silently drops its test. Every field is
  // presence-guarded: a draft from the not-yet-widened route (no listingId / no
  // A/B fields) hydrates as a plain segment draft with A/B off.
  const draftHydratedRef = useRef(false);
  useEffect(() => {
    if (!initialDraft || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    setCampaignId(initialDraft.campaignId ?? null);
    if (typeof initialDraft.name === 'string') setName(initialDraft.name);
    setChannel(initialDraft.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL');
    setLanguage(initialDraft.language === 'AR' ? 'AR' : 'EN');
    if (typeof initialDraft.subject === 'string')
      setSubject(initialDraft.subject);
    if (typeof initialDraft.body === 'string') setBodyText(initialDraft.body);
    if (initialDraft.segmentId) setSegmentId(initialDraft.segmentId);
    if (initialDraft.waTemplateId) setWaTemplateId(initialDraft.waTemplateId);
    // Listing-aware re-hydration (S6, design D-8). A listing-backed draft is EMAIL
    // promo: restore objective + listing so the permit gate re-runs.
    if (initialDraft.listingId) {
      setObjective('LISTING');
      setListingId(initialDraft.listingId);
    }
    // Restore A/B config when the draft had a test on (EMAIL only); the variant
    // copy + settings come back exactly as saved.
    if (initialDraft.abEnabled) {
      setAb({
        enabled: true,
        subjectB: initialDraft.abSubjectB ?? '',
        bodyB: initialDraft.abBodyB ?? '',
        slicePct:
          typeof initialDraft.abSlicePct === 'number'
            ? initialDraft.abSlicePct
            : DEFAULT_AB_CONFIG.slicePct,
        winnerMetric:
          initialDraft.abWinnerMetric === 'REPLIES' ? 'REPLIES' : 'OPENS',
        decideAfterHours:
          typeof initialDraft.abDecideAfterHours === 'number' &&
          initialDraft.abDecideAfterHours > 0
            ? initialDraft.abDecideAfterHours
            : DEFAULT_AB_CONFIG.decideAfterHours,
        minEvents:
          typeof initialDraft.abMinEvents === 'number' &&
          initialDraft.abMinEvents >= 0
            ? initialDraft.abMinEvents
            : DEFAULT_AB_CONFIG.minEvents,
        templateBId: initialDraft.abTemplateBId ?? null,
      });
    }
  }, [initialDraft]);

  // ── caret-true merge-field insert / format (real focus/setSelectionRange) ──
  // Generalized over a target (the body textarea, its current value, and the
  // setter) so variant A (main body) and variant B (A/B test body) share ONE
  // implementation — same caret behaviour, no copy-paste drift.
  const insertTokenInto = useCallback(
    (
      ref: React.RefObject<HTMLTextAreaElement | null>,
      value: string,
      setValue: (v: string) => void,
      field: string,
    ) => {
      const token = `{{${field}}}`;
      const el = ref.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;
      const next = value.slice(0, start) + token + value.slice(end);
      setValue(next);
      const caret = start + token.length;
      requestAnimationFrame(() => {
        const node = ref.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(caret, caret);
      });
    },
    [],
  );

  const applyFormatTo = useCallback(
    (
      ref: React.RefObject<HTMLTextAreaElement | null>,
      value: string,
      setValue: (v: string) => void,
      action: FormatAction,
    ) => {
      const el = ref.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;
      const sel = value.slice(start, end) || action.placeholder;
      const next =
        value.slice(0, start) +
        action.before +
        sel +
        action.after +
        value.slice(end);
      setValue(next);
      const selStart = start + action.before.length;
      const selEnd = selStart + sel.length;
      requestAnimationFrame(() => {
        const node = ref.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(selStart, selEnd);
      });
    },
    [],
  );

  // insertToken/applyFormat (A-variant body) were removed with the email markdown
  // editor — EMAIL compose is now the GrapesJS builder. The shared helpers
  // (insertTokenInto/applyFormatTo) stay for the A/B variant-B text inputs below.
  const insertTokenB = useCallback(
    (field: string) =>
      insertTokenInto(bodyBRef, ab.bodyB, (v) => patchAb({ bodyB: v }), field),
    [insertTokenInto, ab.bodyB, patchAb],
  );
  const applyFormatB = useCallback(
    (action: FormatAction) =>
      applyFormatTo(bodyBRef, ab.bodyB, (v) => patchAb({ bodyB: v }), action),
    [applyFormatTo, ab.bodyB, patchAb],
  );

  // ── validation gates ───────────────────────────────────────────────────────
  const copyTokensFillable = useMemo(
    () =>
      [
        ...parseTemplate(subject).fields,
        ...parseTemplate(bodyText).fields,
      ].every((f) => composeAllowedKeys.has(f)),
    [subject, bodyText, composeAllowedKeys],
  );
  // A/B variant B (EMAIL) is only validated when the test is ON. It must be
  // non-empty and use only fillable merge fields — same contract as variant A.
  const copyTokensFillableB = useMemo(
    () =>
      [
        ...parseTemplate(ab.subjectB).fields,
        ...parseTemplate(ab.bodyB).fields,
      ].every((f) => composeAllowedKeys.has(f)),
    [ab.subjectB, ab.bodyB, composeAllowedKeys],
  );
  // A/B now applies to BOTH channels. The readiness contract differs:
  //   • EMAIL — variant B subject + body present and fillable.
  //   • WHATSAPP — a variant-B template picked that ISN'T the variant-A template
  //     (two genuinely-different approved templates).
  const abActive = ab.enabled;
  const abReady =
    !abActive ||
    (channel === 'WHATSAPP'
      ? Boolean(ab.templateBId && ab.templateBId !== waTemplateId)
      : Boolean(ab.subjectB.trim() && ab.bodyB.trim() && copyTokensFillableB));
  const setupReady =
    Boolean(name.trim()) && (objective === 'SEGMENT' || Boolean(listingId));
  const draftReady =
    channel === 'WHATSAPP'
      ? Boolean(name.trim() && waTemplateId && abReady)
      : Boolean(
          name.trim() &&
          subject.trim() &&
          bodyText.trim() &&
          copyTokensFillable &&
          abReady,
        );

  // The A/B patch sent to save-campaign. When the test is OFF we send only
  // `abEnabled: false` so toggling it off on an existing draft clears the flag.
  // When ON, the variant payload is channel-specific: EMAIL sends the B
  // subject/body (and clears any stale B template); WhatsApp sends the B template
  // id (and clears stale B copy) — so flipping channel on an existing draft can't
  // leave the wrong variant behind. The shared slice/winner/window ride either way.
  const abSavePatch = useMemo<Record<string, unknown>>(
    () =>
      abActive
        ? {
            abEnabled: true,
            ...(channel === 'WHATSAPP'
              ? {
                  abTemplateBId: ab.templateBId ?? '',
                  abSubjectB: '',
                  abBodyB: '',
                }
              : {
                  abSubjectB: ab.subjectB,
                  abBodyB: ab.bodyB,
                  abTemplateBId: '',
                }),
            abSlicePct: ab.slicePct,
            abWinnerMetric: ab.winnerMetric,
            abDecideAfterHours: ab.decideAfterHours,
            abMinEvents: ab.minEvents,
          }
        : { abEnabled: false },
    [abActive, channel, ab],
  );

  // ── route actions ──────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (genState === 'generating') return;
    setGenState('generating');
    try {
      const res = await callPropelRoute<DraftCopyResponse>(
        '/marketing/draft-copy',
        {
          objective: listingFieldsActive
            ? 'PROMOTE_LISTING'
            : 'REACTIVATE_SEGMENT',
          language,
          ...(listingFieldsActive && listingId ? { listingId } : {}),
          ...(segment ? { segmentName: segment.name } : {}),
          ...(steer.trim()
            ? { extraDirection: steer.trim().slice(0, 300) }
            : {}),
        },
      );
      if (
        !res ||
        res.error ||
        typeof res.subject !== 'string' ||
        typeof res.body !== 'string'
      ) {
        setGenState('failed');
        notify(
          envelopeMessage(res, 'Could not draft copy — write it yourself.'),
          'error',
        );
        return;
      }
      setSubject(res.subject);
      setBodyText(res.body);
      setPermitWarning(res.permitWarning ?? null);
      setGenState('idle');
    } catch {
      setGenState('failed');
    }
  }, [
    genState,
    listingFieldsActive,
    language,
    listingId,
    segment,
    steer,
    notify,
  ]);

  // Honest re-resolve of the SAVED segment: save-segment with { resolve:true }
  // re-runs the REAL resolver (same code path as the materializer) for this
  // segment id and stamps a fresh lastResolvedCount — the truthful way to refresh
  // a saved audience's estimate. (segment-preview resolves arbitrary CRITERIA,
  // which we don't have here — calling it with an empty list would fabricate a 0,
  // which the "never zero-fill" rule forbids.)
  const runSegmentPreview = useCallback(async () => {
    if (!segmentId || previewing) return;
    setPreviewing(true);
    setLivePreview(null);
    try {
      const res = await callPropelRoute<SaveSegmentResponse>(
        '/marketing/save-segment',
        { segmentId, resolve: true, channel },
      );
      if (res && res.ok && typeof res.estimate === 'number') {
        setLivePreview({
          estimate: res.estimate,
          description: res.description ?? '',
        });
        setPreviewedAt(Date.now());
      } else {
        // No fresh number → keep the stamped count, never fabricate one.
        notify(
          envelopeMessage(
            res,
            'Could not refresh the estimate — showing the last count.',
          ),
          'error',
        );
      }
    } catch {
      notify(
        'Could not refresh the estimate — showing the last count.',
        'error',
      );
    } finally {
      setPreviewing(false);
    }
  }, [segmentId, previewing, channel, notify]);

  const saveAndReview = useCallback(async () => {
    if (!segmentId || saving) return;
    setSaving(true);
    try {
      const res = await callPropelRoute<SaveCampaignResponse>(
        '/marketing/save-campaign',
        {
          ...(campaignId ? { campaignId } : {}),
          name: name.trim(),
          channel,
          templateSubject: channel === 'WHATSAPP' ? '' : subject,
          templateBody: channel === 'WHATSAPP' ? '' : bodyText,
          templateLanguage: language,
          listingId: listingFieldsActive ? (listingId ?? '') : '',
          segmentId,
          whatsappTemplateId:
            channel === 'WHATSAPP' ? (waTemplateId ?? '') : '',
          ...abSavePatch,
        },
      );
      if (!res || res.error || !res.campaignId) {
        notify(envelopeMessage(res, 'Could not save the campaign.'), 'error');
        return;
      }
      setCampaignId(res.campaignId);
      setTestState('idle');
      setActiveStep(3);
    } catch {
      notify('Could not save the campaign — check your connection.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    segmentId,
    saving,
    campaignId,
    name,
    channel,
    subject,
    bodyText,
    language,
    listingFieldsActive,
    listingId,
    waTemplateId,
    abSavePatch,
    notify,
  ]);

  const saveDraftOnly = useCallback(async () => {
    if (!segmentId || saving) return;
    setSaving(true);
    try {
      const res = await callPropelRoute<SaveCampaignResponse>(
        '/marketing/save-campaign',
        {
          ...(campaignId ? { campaignId } : {}),
          name: name.trim(),
          channel,
          templateSubject: channel === 'WHATSAPP' ? '' : subject,
          templateBody: channel === 'WHATSAPP' ? '' : bodyText,
          templateLanguage: language,
          listingId: listingFieldsActive ? (listingId ?? '') : '',
          segmentId,
          whatsappTemplateId:
            channel === 'WHATSAPP' ? (waTemplateId ?? '') : '',
          ...abSavePatch,
        },
      );
      if (!res || res.error || !res.campaignId) {
        notify(envelopeMessage(res, 'Could not save the draft.'), 'error');
        return;
      }
      notify('Draft saved — find it on the Campaigns board.', 'success');
      onDone();
    } catch {
      notify('Could not save the draft — check your connection.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    segmentId,
    saving,
    campaignId,
    name,
    channel,
    subject,
    bodyText,
    language,
    listingFieldsActive,
    listingId,
    waTemplateId,
    abSavePatch,
    notify,
    onDone,
  ]);

  const sendTest = useCallback(async () => {
    if (!campaignId || testState === 'sending') return;
    setTestState('sending');
    try {
      const res = await callPropelRoute<TestSendResponse>(
        '/marketing/test-send',
        {
          campaignId,
        },
      );
      if (!res || res.error) {
        notify(envelopeMessage(res, 'Test send failed.'), 'error');
        setTestState('idle');
        return;
      }
      notify('Test sent to you.', 'success');
      setTestState('sent');
    } catch {
      notify('Test send failed — check your connection.', 'error');
      setTestState('idle');
    }
  }, [campaignId, testState, notify]);

  const sendNow = useCallback(async () => {
    if (!campaignId || submitting) return;
    setSubmitting(true);
    try {
      const res = await callPropelRoute<SendRequestResponse>(
        '/marketing/send-request',
        { campaignId },
      );
      if (!res || res.error) {
        notify(envelopeMessage(res, 'Could not request the send.'), 'error');
        return;
      }
      notify('Send requested — materializing shortly.', 'success');
      onDone();
    } catch {
      notify('Could not request the send — check your connection.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [campaignId, submitting, notify, onDone]);

  const schedule = useCallback(async () => {
    if (!campaignId || submitting) return;
    const iso = dubaiLocalToIso(scheduleAt);
    if (!iso) {
      notify('Pick a date and time first (Asia/Dubai).', 'error');
      return;
    }
    if (Date.parse(iso) <= Date.now()) {
      notify(
        'That time is in the past — pick a future time (Asia/Dubai).',
        'error',
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await callPropelRoute<SaveCampaignResponse>(
        '/marketing/save-campaign',
        { campaignId, scheduledAt: iso },
      );
      if (!res || res.error) {
        notify(
          envelopeMessage(res, 'Could not schedule the campaign.'),
          'error',
        );
        return;
      }
      notify('Campaign scheduled.', 'success');
      onDone();
    } catch {
      notify('Could not schedule — check your connection.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [campaignId, submitting, scheduleAt, notify, onDone]);

  // ── Review cap-skip preview ─────────────────────────────────────────────────
  // When the user reaches Review with a chosen segment, resolve the REAL number
  // of recipients that would be skipped for hitting their weekly cap — the same
  // pass the materializer runs at fire time (POST /marketing/segment-preview,
  // rulesPreview:true), keyed to the scheduled day so a future-dated blast
  // previews against the cap buckets as they'll stand then. Honest: a failed /
  // unanswerable preview sets 'error' ("couldn't check") and never zero-fills.
  // Re-runs when the segment, channel, or scheduled instant changes.
  //
  // BACKEND TODO(S9-cap-preview): /marketing/segment-preview resolves arbitrary
  // CRITERIA (it reads body.criteria), NOT a saved segmentId — passing segmentId
  // here means parseCriteria(undefined) errors, so rulesPreview is never returned
  // and the GuardrailsCard always lands in its honest "couldn't check" state. To
  // light up the REAL cap-skip number, segment-preview must accept a segmentId
  // (load the stored criteria, then run the same rulesPreview cap pass) — mirror
  // the segmentId branch that save-segment already has. Until then the card stays
  // truthful (never a fake 0), just less informative.
  const scheduledIso =
    sendMode === 'schedule' ? dubaiLocalToIso(scheduleAt) : null;
  useEffect(() => {
    // Only meaningful on Review, and only when there's an audience to resolve.
    if (activeStep !== 3 || !segmentId) {
      setCapPreview({ state: 'idle' });
      return;
    }
    let active = true;
    setCapPreview({ state: 'loading' });
    void callPropelRoute<SegmentPreviewResponse>('/marketing/segment-preview', {
      segmentId,
      channel,
      rulesPreview: true,
      ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
    }).then((res) => {
      if (!active) return;
      // The cap pass only rides when `rulesPreview` is present AND well-formed —
      // an error envelope (or a route that couldn't resolve the audience) carries
      // none, so we surface an honest "couldn't check" rather than a fake 0.
      if (
        res &&
        res.rulesPreview &&
        typeof res.rulesPreview.capReached === 'number'
      ) {
        setCapPreview({
          state: 'loaded',
          capReached: res.rulesPreview.capReached,
        });
      } else {
        setCapPreview({ state: 'error' });
      }
    });
    return () => {
      active = false;
    };
  }, [activeStep, segmentId, channel, scheduledIso]);

  // ── step navigation ────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (activeStep === 0 && !setupReady) return;
    if (activeStep === 1 && !draftReady) return;
    setActiveStep((s) => Math.min(s + 1, 3));
  }, [activeStep, setupReady, draftReady]);
  const goBack = useCallback(
    () => setActiveStep((s) => Math.max(s - 1, 0)),
    [],
  );

  const estimate = segment?.lastResolvedCount ?? 0;

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
      <PropelStepper active={activeStep} />

      {/* Flex COLUMN so a step that returns a flex:1 Stack (the EMAIL Compose
          builder) fills the remaining vertical space instead of collapsing to
          content height — founder: "use more of the vertical space available." */}
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {activeStep === 0 && (
          <SetupStep
            name={name}
            onName={setName}
            channel={channel}
            onChannel={setChannel}
            objective={objective}
            onObjective={(v) => {
              setObjective(v);
              if (v === 'SEGMENT') {
                setListingId(null);
                setPermitWarning(null);
              }
            }}
            language={language}
            onLanguage={setLanguage}
            listings={listings}
            listingId={listingId}
            onListing={setListingId}
            waUsable={approvedTemplates.length > 0}
          />
        )}

        {activeStep === 1 && (
          <ComposeStep
            channel={channel}
            subject={subject}
            onSubject={setSubject}
            bodyText={bodyText}
            onBody={setBodyText}
            language={language}
            subjectRef={subjectRef}
            mergeFields={composeMergeFields}
            customFields={customFields}
            steer={steer}
            onSteer={setSteer}
            genState={genState}
            onGenerate={() => void generate()}
            copyTokensFillable={copyTokensFillable}
            waTemplateId={waTemplateId}
            onWaTemplate={setWaTemplateId}
            approvedTemplates={approvedTemplates}
            permitWarning={permitWarning}
            ab={ab}
            onAbChange={patchAb}
            subjectBRef={subjectBRef}
            bodyBRef={bodyBRef}
            onInsertTokenB={insertTokenB}
            onFormatB={applyFormatB}
            copyTokensFillableB={copyTokensFillableB}
            waTemplates={approvedTemplates}
            bodyIsDesignHtml={isLikelyHtml(bodyText)}
            aiContext={{
              objective: listingFieldsActive
                ? 'PROMOTE_LISTING'
                : 'REACTIVATE_SEGMENT',
              language,
              listingId: listingFieldsActive ? listingId : null,
              segmentName: segment?.name ?? null,
            }}
          />
        )}

        {activeStep === 2 && (
          <AudienceStep
            allSegments={allSegments}
            segmentId={segmentId}
            onSegment={(id) => {
              setSegmentId(id);
              setLivePreview(null);
              setPreviewedAt(null);
            }}
            estimate={estimate}
            livePreview={livePreview}
            previewedAt={previewedAt}
            stampedLabel={segment?.lastResolvedLabel ?? null}
            previewing={previewing}
            onPreview={() => void runSegmentPreview()}
            onOpenSegmentModal={() => setSegmentModalOpen(true)}
          />
        )}

        {activeStep === 3 && (
          <ReviewStep
            name={name}
            channel={channel}
            segmentName={segment?.name ?? ''}
            estimate={estimate}
            campaignId={campaignId}
            testState={testState}
            onTest={() => void sendTest()}
            sendMode={sendMode}
            onSendMode={setSendMode}
            scheduleAt={scheduleAt}
            onScheduleAt={setScheduleAt}
            permitWarning={permitWarning}
            permitBlocked={permitBlocked}
            ab={abActive ? ab : null}
            sendRules={sendRules}
            capPreview={capPreview}
            onEditRules={onEditRules}
          />
        )}
      </Box>

      {/* footer nav */}
      <Group
        justify="space-between"
        pt="sm"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        {activeStep > 0 ? (
          <Button variant="default" onClick={goBack} disabled={submitting}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Group gap="sm">
          {activeStep === 2 && segmentId && (
            <Button
              variant="default"
              leftSection={<IconDeviceFloppy size={16} />}
              loading={saving}
              onClick={() => void saveDraftOnly()}
            >
              Save draft
            </Button>
          )}
          {activeStep < 2 && (
            <Button
              color="red"
              onClick={goNext}
              disabled={activeStep === 0 ? !setupReady : !draftReady}
            >
              Continue
            </Button>
          )}
          {activeStep === 2 && (
            <Button
              color="red"
              loading={saving}
              disabled={!segmentId}
              onClick={() => void saveAndReview()}
            >
              Continue to review
            </Button>
          )}
          {activeStep === 3 &&
            (sendMode === 'now' ? (
              <Button
                color="red"
                loading={submitting}
                disabled={permitBlocked}
                title={
                  permitBlocked
                    ? 'Sending is blocked until the listing’s permit is valid'
                    : undefined
                }
                onClick={() => void sendNow()}
              >
                Send now
              </Button>
            ) : (
              <Button
                color="red"
                loading={submitting}
                onClick={() => void schedule()}
              >
                Schedule
              </Button>
            ))}
        </Group>
      </Group>

      <SegmentCreateModal
        opened={segmentModalOpen}
        onClose={() => setSegmentModalOpen(false)}
        channel={channel}
        onCreated={(seg) => {
          setCreatedSegments((prev) => [
            seg,
            ...prev.filter((p) => p.id !== seg.id),
          ]);
          setSegmentId(seg.id);
          setLivePreview(null);
        }}
      />
    </Stack>
  );
};

// ── Stepper header ───────────────────────────────────────────────────────────
const PropelStepper = ({ active }: { active: number }) => (
  <Group gap={0} wrap="nowrap">
    {WIZARD_STEPS.map((label, idx) => {
      const done = idx < active;
      const current = idx === active;
      return (
        <Group
          key={label}
          gap={8}
          wrap="nowrap"
          style={{ flex: 1, minWidth: 0 }}
        >
          <Box
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              fontWeight: 700,
              background:
                done || current ? 'var(--mantine-color-red-6)' : 'transparent',
              color: done || current ? '#fff' : 'var(--mantine-color-dimmed)',
              border:
                done || current
                  ? 'none'
                  : '1.5px solid var(--mantine-color-default-border)',
            }}
          >
            {done ? <IconCheck size={14} /> : idx + 1}
          </Box>
          <Text
            size="sm"
            fw={current ? 700 : 500}
            c={current ? 'var(--mantine-color-text)' : 'dimmed'}
            truncate
          >
            {label}
          </Text>
          {idx < WIZARD_STEPS.length - 1 && (
            <Box
              style={{
                flex: 1,
                height: 1,
                margin: '0 8px',
                background: 'var(--mantine-color-default-border)',
              }}
            />
          )}
        </Group>
      );
    })}
  </Group>
);

// ── Step 1: Setup ────────────────────────────────────────────────────────────
const SetupStep = ({
  name,
  onName,
  channel,
  onChannel,
  objective,
  onObjective,
  language,
  onLanguage,
  listings,
  listingId,
  onListing,
  waUsable,
}: {
  name: string;
  onName: (v: string) => void;
  channel: 'EMAIL' | 'WHATSAPP';
  onChannel: (v: 'EMAIL' | 'WHATSAPP') => void;
  objective: 'SEGMENT' | 'LISTING';
  onObjective: (v: 'SEGMENT' | 'LISTING') => void;
  language: 'EN' | 'AR';
  onLanguage: (v: 'EN' | 'AR') => void;
  listings: { id: string; name: string; permitOk: boolean }[];
  listingId: string | null;
  onListing: (v: string | null) => void;
  waUsable: boolean;
}) => (
  <Stack gap="md" maw={560}>
    <TextInput
      label="Campaign name"
      description="Internal — recipients never see this."
      placeholder="e.g. October Marina re-engagement"
      value={name}
      onChange={(e) => onName(e.currentTarget.value)}
      required
    />
    <Box>
      <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
        Channel
      </Text>
      <SegmentedControl
        value={channel}
        onChange={(v) => onChannel(v as 'EMAIL' | 'WHATSAPP')}
        data={[
          { label: 'Email', value: 'EMAIL' },
          {
            label: waUsable ? 'WhatsApp' : 'WhatsApp (no approved templates)',
            value: 'WHATSAPP',
            disabled: !waUsable,
          },
        ]}
      />
    </Box>
    <Box>
      <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
        Goal
      </Text>
      <SegmentedControl
        value={objective}
        onChange={(v) => onObjective(v as 'SEGMENT' | 'LISTING')}
        data={[
          { label: 'Re-engage an audience', value: 'SEGMENT' },
          {
            label: 'Promote a listing',
            value: 'LISTING',
            disabled: channel === 'WHATSAPP',
          },
        ]}
      />
      {objective === 'LISTING' && (
        <Text size="xs" c="dimmed" mt={6}>
          A listing promo still sends to a segment (picked in Audience); sending
          is gated by the Trakheesi permit.
        </Text>
      )}
    </Box>
    {objective === 'LISTING' && (
      <Select
        label="Listing"
        placeholder="Pick a listing"
        searchable
        value={listingId}
        onChange={onListing}
        data={listings.map((l) => ({
          value: l.id,
          label: l.permitOk ? l.name : `${l.name} (permit needs attention)`,
        }))}
        nothingFoundMessage="No listings available"
      />
    )}
    <Box>
      <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
        Language
      </Text>
      <SegmentedControl
        value={language}
        onChange={(v) => onLanguage(v as 'EN' | 'AR')}
        data={[
          { label: 'English', value: 'EN' },
          { label: 'Arabic', value: 'AR' },
        ]}
      />
    </Box>
  </Stack>
);

// ── Step 2: Compose ──────────────────────────────────────────────────────────
const ComposeStep = ({
  channel,
  subject,
  onSubject,
  bodyText,
  onBody,
  language,
  subjectRef,
  mergeFields,
  customFields,
  steer,
  onSteer,
  genState,
  onGenerate,
  copyTokensFillable,
  waTemplateId,
  onWaTemplate,
  approvedTemplates,
  permitWarning,
  ab,
  onAbChange,
  subjectBRef,
  bodyBRef,
  onInsertTokenB,
  onFormatB,
  copyTokensFillableB,
  waTemplates,
  bodyIsDesignHtml,
  aiContext,
}: {
  channel: 'EMAIL' | 'WHATSAPP';
  subject: string;
  onSubject: (v: string) => void;
  bodyText: string;
  onBody: (v: string) => void;
  language: 'EN' | 'AR';
  subjectRef: React.Ref<HTMLInputElement>;
  mergeFields: MergeField[];
  customFields: { id: string; key: string; value: string; label: string }[];
  steer: string;
  onSteer: (v: string) => void;
  genState: 'idle' | 'generating' | 'failed';
  onGenerate: () => void;
  copyTokensFillable: boolean;
  waTemplateId: string | null;
  onWaTemplate: (v: string | null) => void;
  approvedTemplates: { id: string; name: string; languageCode: string }[];
  permitWarning: string | null;
  ab: AbConfig;
  onAbChange: (patch: Partial<AbConfig>) => void;
  subjectBRef: React.Ref<HTMLInputElement>;
  bodyBRef: React.Ref<HTMLTextAreaElement>;
  onInsertTokenB: (field: string) => void;
  onFormatB: (action: FormatAction) => void;
  copyTokensFillableB: boolean;
  // Full approved-template records for the WhatsApp A/B variant-B picker.
  waTemplates: WaTemplateOption[];
  // True when the body is designer-emitted HTML (shows the send-path-gap notice).
  bodyIsDesignHtml: boolean;
  // Grounding context for the embedded builder's AI co-pilot (EMAIL only).
  aiContext: GrapesEmailAiContext;
}) => {
  // Which A/B variant the single email builder is currently editing (EMAIL only).
  const [composeVariant, setComposeVariant] = useState<'A' | 'B'>('A');

  if (channel === 'WHATSAPP') {
    return (
      <Stack gap="md" maw={560}>
        <Select
          label="WhatsApp template"
          description="Only Meta-approved templates can send."
          placeholder="Pick an approved template"
          value={waTemplateId}
          onChange={onWaTemplate}
          data={approvedTemplates.map((t) => ({
            value: t.id,
            label: `${t.name} (${t.languageCode})`,
          }))}
          nothingFoundMessage="No approved templates"
        />
        <Text size="xs" c="dimmed">
          WhatsApp body comes from the approved template — there&rsquo;s nothing
          to write here.
        </Text>

        {/* S7 — the FILLED template preview (parity with email's live preview):
            the exact thing that lands, with the template's {{n}} params resolved
            against sample values. Until now WhatsApp showed no preview at all. */}
        {waTemplateId && (
          <WaTemplatePreview
            template={waTemplates.find((t) => t.id === waTemplateId) ?? null}
            language={language}
          />
        )}

        <AbTestPanel
          ab={ab}
          onChange={onAbChange}
          channel="WHATSAPP"
          subjectBRef={subjectBRef}
          bodyBRef={bodyBRef}
          mergeFields={mergeFields}
          customFields={customFields}
          onInsertTokenB={onInsertTokenB}
          onFormatB={onFormatB}
          copyTokensFillableB={copyTokensFillableB}
          waTemplates={waTemplates}
          waTemplateAId={waTemplateId}
        />
      </Stack>
    );
  }

  // EMAIL — when A/B is ON, ONE GrapesJS canvas flips between Variant A and B via a
  // switcher (NOT two builder instances). The active variant routes the Subject +
  // the builder's seed/sync: A → subject/bodyText, B → ab.subjectB/ab.bodyB. The
  // builder remounts on switch (its `key` changes) so it re-seeds the right design;
  // design-syncs-to-body stays intact per variant.
  const abOn = ab.enabled;
  const isB = abOn && composeVariant === 'B';
  const variantSubject = isB ? ab.subjectB : subject;
  const setVariantSubject = (v: string) =>
    isB ? onAbChange({ subjectB: v }) : onSubject(v);
  const variantBody = isB ? ab.bodyB : bodyText;
  const setVariantBody = (v: string) =>
    isB ? onAbChange({ bodyB: v }) : onBody(v);

  return (
    // EMAIL Compose = the embedded GrapesJS builder IS the surface (founder UX:
    // "compose should just be the GrapesJS builder"). Subject sits above the
    // canvas; the builder's live canvas is the preview (so no separate preview
    // column). The design syncs to bodyText continuously via onHtmlChange — no
    // markdown textarea, no "Design in builder" button, no HTML-into-a-textfield.
    <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
      <Group justify="space-between" align="flex-end">
        <Group gap="sm" align="center">
          <Text size="sm" fw={600} c="var(--mantine-color-text)">
            Email content
          </Text>
          {/* A | B switcher — flips the SAME builder canvas between the two
              variant designs (only when A/B is on). */}
          {abOn ? (
            <SegmentedControl
              size="xs"
              value={composeVariant}
              onChange={(v) => setComposeVariant(v as 'A' | 'B')}
              data={[
                { label: 'Variant A', value: 'A' },
                { label: 'Variant B', value: 'B' },
              ]}
            />
          ) : null}
        </Group>
        {/* "Draft with AI" stays — it pre-fills the builder's text. */}
        <Popover width={300} position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <Button
              size="compact-sm"
              variant="light"
              color="red"
              leftSection={<IconSparkles size={14} />}
              loading={genState === 'generating'}
            >
              Draft with AI
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                Optional steer — what should the copy emphasize? The AI text
                pre-fills the builder; keep designing from there.
              </Text>
              <Textarea
                autosize
                minRows={2}
                maxRows={4}
                placeholder="e.g. warm, low-pressure, one clear reply prompt"
                value={steer}
                onChange={(e) => onSteer(e.currentTarget.value)}
              />
              <Button
                size="compact-sm"
                color="red"
                loading={genState === 'generating'}
                onClick={onGenerate}
              >
                Generate
              </Button>
              {genState === 'failed' && (
                <Text size="xs" c="red">
                  Generation failed — design the email manually.
                </Text>
              )}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>

      <TextInput
        ref={isB ? undefined : subjectRef}
        label={isB ? 'Subject (Variant B)' : 'Subject'}
        placeholder="Subject line"
        value={variantSubject}
        onChange={(e) => setVariantSubject(e.currentTarget.value)}
      />

      {/* The send-path-gap notice (kept per #58): the design syncs to the body,
          but the send drain still text-renders it into the standard layout until
          HTML-email sending lands. This is backend work, NOT this compose UX. */}
      {bodyIsDesignHtml && (
        <Alert
          color="yellow"
          variant="light"
          py={6}
          icon={<IconAlertCircle size={16} />}
        >
          <Text size="xs">
            Heads up: HTML-email sending isn’t enabled yet, so this design sends
            as text in the standard branded layout (not pixel-for-pixel) for
            now.
          </Text>
        </Alert>
      )}
      {!copyTokensFillable && (
        <Alert
          color="red"
          variant="light"
          py={6}
          icon={<IconAlertCircle size={16} />}
        >
          <Text size="xs">
            Your email uses a merge field this campaign can’t fill — it would
            send blank. Remove it or attach a listing.
          </Text>
        </Alert>
      )}
      {permitWarning && (
        <Alert
          color="yellow"
          variant="light"
          py={6}
          icon={<IconAlertCircle size={16} />}
        >
          <Text size="xs">{permitWarning}</Text>
        </Alert>
      )}

      {/* THE compose surface — the embedded GrapesJS email builder. It seeds from
          the active variant's body (A or B; AI-drafted copy / a re-edited draft
          carry in), syncs the compiled HTML back live, and its trimmed toolbar
          offers merge-tag insert + MJML view + Save-as-template. `flex: 1` makes it
          fill the remaining vertical height (founder: use more vertical space). The
          `key` remounts it on a variant switch so it re-seeds the right design. */}
      <Box style={{ flex: 1, minHeight: 280, display: 'flex' }}>
        <GrapesEmailBuilder
          key={isB ? 'variant-B' : 'variant-A'}
          mode="campaign"
          customFields={customFields}
          hideToolbar
          initial={{
            subject: variantSubject,
            bodyText: variantBody,
            languageCode: language,
          }}
          onHtmlChange={setVariantBody}
          aiContext={aiContext}
          onSubjectSuggested={setVariantSubject}
        />
      </Box>

      {/* A/B config — the test toggle + slice/winner settings. Variant B's email
          BODY is now designed in the builder above (via the A|B switcher), so the
          panel no longer renders a markdown editor for it; it shows only the test
          mechanics (and, for WhatsApp, the variant-B template picker). */}
      <AbTestPanel
        ab={ab}
        onChange={onAbChange}
        channel="EMAIL"
        subjectBRef={subjectBRef}
        bodyBRef={bodyBRef}
        mergeFields={mergeFields}
        customFields={customFields}
        onInsertTokenB={onInsertTokenB}
        onFormatB={onFormatB}
        copyTokensFillableB={copyTokensFillableB}
        waTemplates={waTemplates}
        waTemplateAId={null}
        hideEmailBodyEditor
      />
    </Stack>
  );
};

// ── S7: WhatsApp filled-template preview ─────────────────────────────────────
// Renders the EXACT message body that lands — the approved template with its
// {{n}} params resolved against sample values — styled as a WhatsApp bubble, the
// channel parity for email's live preview. Honest: a param the preview can't fill
// shows as the literal {{n}} (never a silent blank), matching renderParams.
const WaTemplatePreview = ({
  template,
  language,
}: {
  template: WaTemplateOption | null;
  language: 'EN' | 'AR';
}) => {
  const filled = useMemo(() => {
    if (!template) return null;
    const { params } = renderParams(
      template.paramMap as MergeField[],
      WA_PREVIEW_SAMPLES,
      language,
    );
    return previewTemplateBody(template.bodyText, params);
  }, [template, language]);

  if (!template || filled === null) return null;

  return (
    <Box>
      <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
        Live preview
      </Text>
      <Box
        style={{
          background: '#e5ddd5',
          borderRadius: 'var(--mantine-radius-md)',
          padding: 16,
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Box
          dir={language === 'AR' ? 'rtl' : 'ltr'}
          style={{
            background: '#ffffff',
            borderRadius: 8,
            padding: '8px 12px',
            maxWidth: '85%',
            boxShadow: '0 1px 1px rgba(0,0,0,0.12)',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#111',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {filled}
        </Box>
      </Box>
      <Text size="xs" c="dimmed" mt={6}>
        The approved template, rendered with sample values — the real
        per-recipient values fill at send time. Any {'{{n}}'} still showing is a
        param with no sample.
      </Text>
    </Box>
  );
};

// S7 — the honest age of the shown estimate. A live refresh in this session →
// "counted just now / Xm ago"; otherwise fall back to the segment's stored stamp
// ("counted 2h ago"); if neither is known, state the rule plainly. The trailing
// "· recounts at send" is appended by the caller. NOT a count-up — a real figure.
const estimateAgeNote = (
  previewedAt: number | null,
  stampedLabel: string | null,
): string => {
  if (previewedAt != null) {
    const mins = Math.floor((Date.now() - previewedAt) / 60000);
    if (mins < 1) return 'Counted just now';
    if (mins < 60) return `Counted ~${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `Counted ~${hours}h ago`;
  }
  // The segment label already carries an age, e.g. "~1,234 (2h ago)" — extract
  // just the parenthetical so we say "Counted 2h ago" without doubling the count.
  if (stampedLabel) {
    const m = /\(([^)]+)\)/.exec(stampedLabel);
    if (m) return `Counted ${m[1]}`;
  }
  return 'Estimate — resolved live';
};

// ── Step 3: Audience ─────────────────────────────────────────────────────────
const AudienceStep = ({
  allSegments,
  segmentId,
  onSegment,
  estimate,
  livePreview,
  previewedAt,
  stampedLabel,
  previewing,
  onPreview,
  onOpenSegmentModal,
}: {
  allSegments: SegmentOption[];
  segmentId: string | null;
  onSegment: (id: string | null) => void;
  estimate: number;
  livePreview: { estimate: number; description: string } | null;
  // S7 — when the count was last refreshed in THIS session (epoch ms), or null
  // if it's still the stored stamp. stampedLabel is the segment's saved
  // "(2h ago)"-style label, shown until a live refresh supersedes it.
  previewedAt: number | null;
  stampedLabel: string | null;
  previewing: boolean;
  onPreview: () => void;
  onOpenSegmentModal: () => void;
}) => (
  <Stack gap="md" maw={620}>
    <Group justify="space-between" align="flex-end">
      <Text size="sm" fw={600} c="var(--mantine-color-text)">
        Who should receive this?
      </Text>
      <Button
        size="compact-sm"
        variant="light"
        leftSection={<IconPlus size={14} />}
        onClick={onOpenSegmentModal}
      >
        New segment
      </Button>
    </Group>

    <Select
      placeholder={
        allSegments.length === 0 ? 'No saved audiences yet' : 'Pick a segment'
      }
      searchable
      value={segmentId}
      onChange={onSegment}
      leftSection={<IconUsers size={16} />}
      data={allSegments.map((s) => ({
        value: s.id,
        label: `${s.name} · ${s.lastResolvedLabel}`,
      }))}
      nothingFoundMessage="No audiences — create one"
    />

    {segmentId && (
      <Card
        withBorder
        radius="md"
        padding="md"
        style={{ background: 'var(--mantine-color-body)' }}
      >
        <Group justify="space-between" align="center">
          <Box>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Estimated reach
            </Text>
            <Text size="xl" fw={700} c="var(--mantine-color-text)">
              {(livePreview?.estimate ?? estimate).toLocaleString('en-US')}
            </Text>
            <Text size="xs" c="dimmed">
              {estimateAgeNote(previewedAt, stampedLabel)} · recounts at send.
            </Text>
          </Box>
          <Button
            variant="default"
            size="compact-sm"
            loading={previewing}
            onClick={onPreview}
          >
            Refresh estimate
          </Button>
        </Group>
        {livePreview?.description && (
          <Text size="xs" c="dimmed" mt="sm">
            {livePreview.description}
          </Text>
        )}
      </Card>
    )}

    {allSegments.length === 0 && (
      <Alert color="gray" variant="light" icon={<IconUsers size={16} />}>
        You don&rsquo;t have any audiences yet. Create one from a CSV/Excel
        upload or live criteria with &ldquo;New segment&rdquo;.
      </Alert>
    )}
  </Stack>
);

// ── Step 4: Review ───────────────────────────────────────────────────────────
const ReviewStep = ({
  name,
  channel,
  segmentName,
  estimate,
  campaignId,
  testState,
  onTest,
  sendMode,
  onSendMode,
  scheduleAt,
  onScheduleAt,
  permitWarning,
  permitBlocked,
  ab,
  sendRules,
  capPreview,
  onEditRules,
}: {
  name: string;
  channel: 'EMAIL' | 'WHATSAPP';
  segmentName: string;
  estimate: number;
  campaignId: string | null;
  testState: 'idle' | 'sending' | 'sent';
  onTest: () => void;
  sendMode: 'now' | 'schedule';
  onSendMode: (v: 'now' | 'schedule') => void;
  scheduleAt: string;
  onScheduleAt: (v: string) => void;
  permitWarning: string | null;
  // S9 — compliance block: a listing promo whose Trakheesi permit isn't valid.
  // The send-request route re-gates this server-side; surfacing it here means the
  // user understands the block BEFORE launching, as a calm inline gate.
  permitBlocked: boolean;
  ab: AbConfig | null;
  sendRules: SendRulesPayload | undefined;
  capPreview: CapPreview;
  onEditRules?: () => void;
}) => (
  <Stack gap="md" maw={560}>
    <Card
      withBorder
      radius="md"
      padding="md"
      style={{ background: 'var(--mantine-color-body)' }}
    >
      <Stack gap={8}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <ReviewRow label="Campaign" value={name} />
        </Group>
        <ReviewRow
          label="Channel"
          value={channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
        />
        <ReviewRow label="Audience" value={segmentName || '—'} />
        <ReviewRow
          label="Estimated reach"
          value={estimate.toLocaleString('en-US')}
        />
        {ab && (
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Text
              size="xs"
              c="dimmed"
              fw={600}
              tt="uppercase"
              style={{ flex: 'none' }}
            >
              A/B test
            </Text>
            <Group gap={6} wrap="nowrap" justify="flex-end">
              <Badge size="sm" variant="light" color="red">
                A/B on
              </Badge>
              <Text size="sm" c="var(--mantine-color-text)" ta="right">
                {ab.slicePct}% slice · winner by{' '}
                {ab.winnerMetric === 'OPENS' ? 'opens' : 'replies'} after{' '}
                {ab.decideAfterHours}h
              </Text>
            </Group>
          </Group>
        )}
      </Stack>
    </Card>

    {permitBlocked && (
      <Alert
        color="red"
        variant="light"
        icon={<IconAlertCircle size={16} />}
        title="This listing’s permit isn’t valid yet"
      >
        A listing promo can&rsquo;t send until its Trakheesi permit is valid.
        You can save this as a draft now; sending stays blocked until the permit
        clears (the send is re-checked at launch).
      </Alert>
    )}

    {permitWarning && !permitBlocked && (
      <Alert
        color="yellow"
        variant="light"
        icon={<IconAlertCircle size={16} />}
      >
        {permitWarning}
      </Alert>
    )}

    <GuardrailsCard
      rules={sendRules}
      channel={channel}
      estimate={estimate}
      scheduledLocal={sendMode === 'schedule' ? scheduleAt : ''}
      capPreview={capPreview}
      onEditRules={onEditRules}
    />

    {channel === 'EMAIL' && (
      <Group justify="space-between" align="center">
        <Box>
          <Text size="sm" fw={600} c="var(--mantine-color-text)">
            Send a test to yourself
          </Text>
          <Text size="xs" c="dimmed">
            See the real branded email in your inbox before the blast.
          </Text>
        </Box>
        <Button
          variant="default"
          leftSection={
            testState === 'sent' ? (
              <IconCheck size={16} />
            ) : (
              <IconTestPipe size={16} />
            )
          }
          loading={testState === 'sending'}
          disabled={!campaignId}
          onClick={onTest}
        >
          {testState === 'sent' ? 'Sent — send again' : 'Send test'}
        </Button>
      </Group>
    )}

    <Box>
      <Text size="sm" fw={600} mb={6} c="var(--mantine-color-text)">
        When
      </Text>
      <SegmentedControl
        value={sendMode}
        onChange={(v) => onSendMode(v as 'now' | 'schedule')}
        data={[
          { label: 'Send now', value: 'now' },
          { label: 'Schedule', value: 'schedule' },
        ]}
      />
      {sendMode === 'schedule' && (
        <TextInput
          mt="sm"
          type="datetime-local"
          label="Date & time (Asia/Dubai)"
          leftSection={<IconMail size={16} />}
          value={scheduleAt}
          onChange={(e) => onScheduleAt(e.currentTarget.value)}
        />
      )}
    </Box>
  </Stack>
);

const ReviewRow = ({ label, value }: { label: string; value: string }) => (
  <Group justify="space-between" gap="md" wrap="nowrap">
    <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ flex: 'none' }}>
      {label}
    </Text>
    <Text
      size="sm"
      c="var(--mantine-color-text)"
      ta="right"
      style={{ wordBreak: 'break-word' }}
    >
      {value}
    </Text>
  </Group>
);
