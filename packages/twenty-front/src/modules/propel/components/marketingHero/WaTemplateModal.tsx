/* oxlint-disable twenty/no-hardcoded-colors -- the WaBubblePreview renders the
   well-known WhatsApp chat look (wallpaper #efeae2, white received bubble, CTA
   link-blue #027eb5, read-tick blue) so the operator sees the message as the
   recipient will. These are WhatsApp brand chrome by design and deliberately do
   NOT track the CRM theme — same precedent as the social ComposerPreview. */
import {
  Alert,
  Box,
  Button,
  Collapse,
  Group,
  List,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import {
  IconArrowBackUp,
  IconExternalLink,
  IconPhone,
  IconSparkles,
  IconTrash,
} from 'twenty-ui/display';
import { usePropelToast } from '@/propel/hooks/usePropelToast';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { friendlyError } from '@/propel/lib/friendlyError';
import {
  bodyParamCount,
  bodyPlaceholdersValid,
  DRAIN_POPULATED_FIELDS,
  ensureOptOut,
  hasNonNumericPlaceholder,
  optOutAdditionNote,
  previewTemplateBody,
  renderParams,
  validateCreateInput,
  WA_PARAM_FIELDS,
  type WaButtonInput,
  type WaHeaderInput,
  type WaMergeField,
  type WaMergeValues,
} from '@/propel/lib/waTemplate';
import { type WaTemplateOption } from '@/propel/types/marketingHome';
import { WaTemplateQualityPanel } from './WaTemplateQualityPanel';

// Mantine modal rebuild of the legacy WhatsApp TemplateEditorSheet
// (marketing-cloud-tpleditors.tsx), brought to FULL parity. WhatsApp templates are
// pre-approved by Meta: the editor captures the EXACT body Meta reviews plus the
// positional {{1..n}} → merge-field binding (paramMap, APPEND-ONLY — the click
// order IS the {{n}} order). "Save draft" persists via POST /marketing/save-template;
// "Submit to Meta" sends the typed create-input to POST /marketing/wa-template-create.
//
// PARITY (matches the legacy completeness, not just the route as sole validator):
//   • client-side Meta-validation mirror (validateCreateInput) → the prominent
//     "N things to fix" submit BLOCKER, reusing the same pure helpers
//     (waTemplate.ts — the fork-local port of wa-template-create + wa-template-renderer);
//   • the FULL optional-component editor: header None/Text/Image/Video/Document
//     (media headers take an example handle), QUICK_REPLY + URL + PHONE_NUMBER
//     buttons with per-type limits, body sample-value inputs persisted via bodyExample;
//   • the drain-aware FILLED preview (previewTemplateBody + renderParams) — the
//     same substitution the hub preview + rendered-content hash use.

// Sample fills for the live preview — covers EVERY field the drain can populate
// (DRAIN_POPULATED_FIELDS): the recipient identity set, the assigned-agent set, the
// office singleton, and the listing/recipient snapshot. Cosmetic; real sends fill
// from live data.
const TEMPLATE_PREVIEW_SAMPLES: WaMergeValues = {
  firstName: 'Sara',
  lastName: 'Ahmed',
  fullName: 'Sara Ahmed',
  email: 'sara.ahmed@example.com',
  phone: '+971 50 555 6666',
  agentName: 'John Carter',
  agentPhone: '+971 50 333 4444',
  agentEmail: 'john.carter@remax.ae',
  officeName: 'RE/MAX Hub',
  listingTitle: 'Marina View 2BR',
  permitNumber: 'RERA-12345',
};

// WhatsApp vocabulary that is valid but NOT yet auto-filled by the drain — shown as
// a read-only reference so the catalog is honest about what can/can't bind.
const WA_NOT_YET_FILLABLE = WA_PARAM_FIELDS.filter(
  (f) => !DRAIN_POPULATED_FIELDS.includes(f),
);

const TPL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'PAUSED',
] as const;
const META_NAME_RE = /^[a-z0-9_]+$/;
const REVIEWED_STATES = new Set(['SUBMITTED', 'APPROVED']);
const SUBMIT_LOCALE: Record<'EN' | 'AR', string> = { EN: 'en_US', AR: 'ar' };

// ── AI draft bench (POST /marketing/wa/draft) ──────────────────────────────────
// The authoring co-pilot: a plain-language brief → a Meta-COMPLIANT draft the LLM
// pre-validates (positional {{1..n}} params, caps, per-category rules). It prefills
// the editor below; the operator reviews/edits and submits through the SAME
// "Submit to Meta" path — the AI never bypasses Meta approval.
const AI_TONES: { value: string; label: string }[] = [
  { value: 'FRIENDLY', label: 'Friendly' },
  { value: 'PROFESSIONAL', label: 'Professional' },
  { value: 'URGENT', label: 'Time-sensitive' },
  { value: 'LUXURY', label: 'Luxury' },
];

interface WaDraftPayload {
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  bodyText: string;
  bodyExample: string[];
  paramMap: string[];
  footer?: string;
  header?: { format: 'TEXT'; text: string; example?: string };
  buttons?: {
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phoneNumber?: string;
  }[];
}

const titleCase = (s: string): string =>
  s ? s.charAt(0) + s.slice(1).toLowerCase() : s;

// ── optional-component editor state (Meta submit only; not persisted locally) ──
// HEADER / FOOTER / BUTTONS aren't drain-bound, so they ride into Meta's components
// schema at submit time and aren't stored on the local whatsappTemplate row.
type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type EditorButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example: string }
  | { type: 'PHONE_NUMBER'; text: string; phoneNumber: string };

const BUTTON_KINDS: { v: EditorButton['type']; label: string }[] = [
  { v: 'QUICK_REPLY', label: 'Quick reply' },
  { v: 'URL', label: 'Visit URL' },
  { v: 'PHONE_NUMBER', label: 'Call' },
];

const newButton = (type: EditorButton['type']): EditorButton =>
  type === 'URL'
    ? { type: 'URL', text: '', url: '', example: '' }
    : type === 'PHONE_NUMBER'
      ? { type: 'PHONE_NUMBER', text: '', phoneNumber: '' }
      : { type: 'QUICK_REPLY', text: '' };

// ── live WhatsApp chat-bubble PREVIEW ──────────────────────────────────────────
// Styles the well-known WhatsApp light-mode look ourselves (no asset deps): the
// wallpaper, a received-message white card with a tail, and WhatsApp's button
// conventions — call-to-action (URL/phone) buttons sit INSIDE the bubble below a
// divider in link-blue with an icon; quick-reply buttons render as SEPARATE full-
// width pills under the bubble (exactly how Meta renders them on a phone). This is
// cosmetic: a faithful render of header + filled-body + footer + buttons, updating
// live as the operator edits, so they see what the recipient will see BEFORE Meta
// review. It is NOT the wire format (the route owns assembleComponents).

const WA = {
  wallpaper: '#efeae2',
  bubble: '#ffffff',
  bodyText: '#111b21',
  metaText: '#667781', // footer + timestamp grey
  link: '#027eb5', // WhatsApp CTA-button blue
  divider: '#e9edef',
  tick: '#53bdeb',
} as const;

const HEADER_MEDIA_LABEL: Record<'IMAGE' | 'VIDEO' | 'DOCUMENT', string> = {
  IMAGE: '🖼  Image',
  VIDEO: '🎬  Video',
  DOCUMENT: '📄  Document',
};

type PreviewHeader =
  | { kind: 'TEXT'; text: string }
  | { kind: 'MEDIA'; format: 'IMAGE' | 'VIDEO' | 'DOCUMENT' }
  | null;

type PreviewButton =
  | { type: 'QUICK_REPLY'; label: string }
  | { type: 'URL'; label: string }
  | { type: 'PHONE_NUMBER'; label: string };

const WaBubblePreview = ({
  header,
  body,
  footer,
  buttons,
  rtl,
}: {
  header: PreviewHeader;
  body: string;
  footer: string;
  buttons: PreviewButton[];
  rtl: boolean;
}) => {
  // CTA buttons (URL / call) render inside the bubble; quick replies render as
  // separate pills under the bubble — WhatsApp's actual phone layout.
  const ctaButtons = buttons.filter((b) => b.type !== 'QUICK_REPLY');
  const quickReplies = buttons.filter((b) => b.type === 'QUICK_REPLY');
  const dir = rtl ? 'rtl' : 'ltr';
  const sent = '12:30';

  return (
    <Box
      style={{
        background: WA.wallpaper,
        // subtle WhatsApp-style doodle texture via layered radial dots
        backgroundImage:
          'radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        borderRadius: 12,
        padding: '20px 14px',
        minHeight: 140,
      }}
    >
      <Box style={{ maxWidth: 320 }}>
        {/* received bubble (white, left-aligned, with tail) */}
        <Box
          style={{
            position: 'relative',
            background: WA.bubble,
            borderRadius: 8,
            borderTopLeftRadius: 0,
            boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)',
            padding: '6px 9px 8px',
            direction: dir,
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {/* tail (top-left wedge) */}
          <Box
            style={{
              position: 'absolute',
              top: 0,
              left: -8,
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '0 8px 8px 0',
              borderColor: `transparent ${WA.bubble} transparent transparent`,
            }}
          />

          {/* HEADER */}
          {header?.kind === 'MEDIA' ? (
            <Box
              style={{
                background: '#f0f2f5',
                borderRadius: 6,
                height: 132,
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: WA.metaText,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {HEADER_MEDIA_LABEL[header.format]}
            </Box>
          ) : header?.kind === 'TEXT' && header.text.trim() !== '' ? (
            <Text
              style={{
                color: WA.bodyText,
                fontWeight: 700,
                fontSize: 14.5,
                lineHeight: 1.35,
                marginBottom: 4,
                wordBreak: 'break-word',
              }}
            >
              {header.text}
            </Text>
          ) : null}

          {/* BODY (with sample values filled in) */}
          <Text
            style={{
              color: WA.bodyText,
              fontSize: 14.2,
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {body.trim() !== '' ? body : 'Your message preview appears here…'}
          </Text>

          {/* FOOTER */}
          {footer.trim() !== '' ? (
            <Text
              style={{
                color: WA.metaText,
                fontSize: 12.5,
                lineHeight: 1.35,
                marginTop: 5,
                wordBreak: 'break-word',
              }}
            >
              {footer}
            </Text>
          ) : null}

          {/* timestamp + read tick (cosmetic) */}
          <Box
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 3,
              marginTop: 2,
            }}
          >
            <Text style={{ color: WA.metaText, fontSize: 11 }}>{sent}</Text>
            <span style={{ color: WA.tick, fontSize: 13, lineHeight: 1 }}>
              ✓✓
            </span>
          </Box>

          {/* CTA buttons inside the bubble (URL / call), divided + link-blue */}
          {ctaButtons.length > 0 ? (
            <Box style={{ marginTop: 6 }}>
              {ctaButtons.map((b, i) => (
                <Box
                  key={i}
                  style={{
                    borderTop: `1px solid ${WA.divider}`,
                    padding: '9px 0 3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    color: WA.link,
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {b.type === 'URL' ? (
                    <IconExternalLink size={17} />
                  ) : (
                    <IconPhone size={17} />
                  )}
                  <span style={{ wordBreak: 'break-word' }}>
                    {b.label.trim() !== '' ? b.label : 'Button'}
                  </span>
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>

        {/* quick-reply buttons — separate full-width pills under the bubble */}
        {quickReplies.length > 0 ? (
          <Stack gap={6} mt={6}>
            {quickReplies.map((b, i) => (
              <Box
                key={i}
                style={{
                  background: WA.bubble,
                  borderRadius: 8,
                  boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)',
                  padding: '9px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  color: WA.link,
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                <IconArrowBackUp size={17} />
                <span style={{ wordBreak: 'break-word' }}>
                  {b.label.trim() !== '' ? b.label : 'Quick reply'}
                </span>
              </Box>
            ))}
          </Stack>
        ) : null}
      </Box>
    </Box>
  );
};

export const WaTemplateModal = ({
  initial,
  onClose,
}: {
  initial: WaTemplateOption | null;
  onClose: (changed: boolean) => void;
}) => {
  const notify = usePropelToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [languageCode, setLanguageCode] = useState<'EN' | 'AR'>(
    initial?.languageCode ?? 'EN',
  );
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>(
    initial?.category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
  );
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? '');
  const [paramMap, setParamMap] = useState<string[]>(initial?.paramMap ?? []);
  const [bodyExample, setBodyExample] = useState<string[]>(
    initial?.bodyExample ?? [],
  );
  const [status, setStatus] = useState<string>(initial?.status ?? 'DRAFT');
  // Optional components — submit-only, not persisted on the local row.
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerExample, setHeaderExample] = useState('');
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<EditorButton[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // AI draft bench — open for a NEW template (the creative bottleneck), collapsed
  // when editing an existing one (the body already exists).
  const [aiOpen, setAiOpen] = useState(initial === null);
  const [aiBrief, setAiBrief] = useState('');
  const [aiTone, setAiTone] = useState<string>('FRIENDLY');
  const [aiBusy, setAiBusy] = useState(false);

  // Brief → compliant draft → prefill the editor. Never bypasses Meta approval: it
  // only fills the fields the operator then reviews/edits and submits below.
  const draftWithAi = async () => {
    if (aiBusy || aiBrief.trim() === '') return;
    setAiBusy(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      draft?: WaDraftPayload;
      compliance?: string[];
      error?: string;
      code?: string;
      operatorAction?: string;
    }>('/marketing/wa/draft', {
      action: 'DRAFT',
      objective: aiBrief.trim(),
      category,
      language: SUBMIT_LOCALE[languageCode],
      tone: aiTone,
    });
    setAiBusy(false);
    if (res === null || res.error !== undefined || res.draft === undefined) {
      const raw =
        res?.code === 'ENV_MISSING'
          ? res.error || "The AI draft isn't configured on this environment."
          : res?.operatorAction || res?.error || '';
      notify(friendlyError(raw, 'draft'), 'error');
      return;
    }
    const d = res.draft;
    // Prefill the Meta-reviewed fields. category/language stay operator-owned above.
    setBodyText(d.bodyText);
    setParamMap(Array.isArray(d.paramMap) ? d.paramMap : []);
    setBodyExample(Array.isArray(d.bodyExample) ? d.bodyExample : []);
    setFooter(d.footer ?? '');
    if (d.header && d.header.format === 'TEXT') {
      setHeaderFormat('TEXT');
      setHeaderText(d.header.text ?? '');
      setHeaderExample(d.header.example ?? '');
    } else {
      setHeaderFormat('NONE');
      setHeaderText('');
      setHeaderExample('');
    }
    setButtons(
      (d.buttons ?? []).map((b): EditorButton =>
        b.type === 'URL'
          ? { type: 'URL', text: b.text, url: b.url ?? '', example: '' }
          : b.type === 'PHONE_NUMBER'
            ? { type: 'PHONE_NUMBER', text: b.text, phoneNumber: b.phoneNumber ?? '' }
            : { type: 'QUICK_REPLY', text: b.text },
      ),
    );
    setAiOpen(false);
    notify('Draft ready — review and edit below, then submit to Meta.', 'success');
  };

  // The distinct {{n}} the body needs sample values for (1..k). Reuse counts once.
  const bodyParams = useMemo(() => bodyParamCount(bodyText), [bodyText]);

  // Append-only binding: the chip adds {{n}} at the end and pushes its field.
  const appendParam = (key: WaMergeField) => {
    setBodyText(
      (b) =>
        `${b}${b && !b.endsWith(' ') ? ' ' : ''}{{${paramMap.length + 1}}}`,
    );
    setParamMap((m) => [...m, key]);
  };
  const clearParams = () => {
    setBodyText((b) => b.replace(/\s?\{\{\s*\d+\s*\}\}/g, ''));
    setParamMap([]);
  };

  const rtl = languageCode === 'AR';
  const nameOk = META_NAME_RE.test(name.trim());
  const badPlaceholder = useMemo(
    () => hasNonNumericPlaceholder(bodyText),
    [bodyText],
  );
  const seqOk = useMemo(
    () => bodyPlaceholdersValid(bodyText, paramMap.length),
    [bodyText, paramMap.length],
  );

  // Drain-aware FILLED preview — the same substitution the hub preview + the
  // rendered-content hash use (NOT what's sent: Meta renders from the approved body).
  const previewBody = useMemo(
    () =>
      previewTemplateBody(
        bodyText,
        renderParams(
          paramMap as WaMergeField[],
          TEMPLATE_PREVIEW_SAMPLES,
          languageCode,
        ).params,
      ),
    [bodyText, paramMap, languageCode],
  );

  // Header rendered in the bubble: a TEXT header is shown with its own {{1}}
  // example substituted; a media header shows a placeholder card.
  const previewHeader = useMemo<PreviewHeader>(() => {
    if (headerFormat === 'TEXT') {
      const text = previewTemplateBody(
        headerText,
        headerExample.trim() ? [headerExample.trim()] : [],
      );
      return { kind: 'TEXT', text };
    }
    if (
      headerFormat === 'IMAGE' ||
      headerFormat === 'VIDEO' ||
      headerFormat === 'DOCUMENT'
    ) {
      return { kind: 'MEDIA', format: headerFormat };
    }
    return null;
  }, [headerFormat, headerText, headerExample]);

  // Editing a reviewed template: any Meta-reviewed field changing invalidates the
  // prior verdict, so a reviewed status must drop to DRAFT.
  const reviewedDirty =
    initial !== null &&
    (name.trim() !== initial.name ||
      languageCode !== initial.languageCode ||
      category !== (initial.category === 'UTILITY' ? 'UTILITY' : 'MARKETING') ||
      bodyText !== initial.bodyText ||
      JSON.stringify(paramMap) !== JSON.stringify(initial.paramMap ?? []));
  useEffect(() => {
    if (reviewedDirty && REVIEWED_STATES.has(status)) setStatus('DRAFT');
  }, [reviewedDirty, status]);

  const canSave =
    name.trim() !== '' &&
    nameOk &&
    seqOk &&
    !(reviewedDirty && REVIEWED_STATES.has(status)) &&
    !saving;

  // A template managed in Meta (has a Meta id OR status !== DRAFT) is not
  // resubmittable from here — mirrors the server's editTemplateId gate.
  const alreadyInMeta = Boolean(
    initial &&
    (initial.metaTemplateId || (initial.status && initial.status !== 'DRAFT')),
  );

  // Assemble the typed create-input from editor state (mirrors the route's parse).
  // The input as it will ACTUALLY be submitted. ensureOptOut runs here, not just
  // server-side, so the preview, the validation and the submit all describe the
  // same message — the operator never sees one footer and sends another.
  const { input: createInput, added: optOutAdded } = useMemo(() => {
    const header: WaHeaderInput | undefined =
      headerFormat === 'TEXT' && headerText.trim()
        ? {
            format: 'TEXT',
            text: headerText,
            example: headerExample.trim() || undefined,
          }
        : headerFormat === 'IMAGE' ||
            headerFormat === 'VIDEO' ||
            headerFormat === 'DOCUMENT'
          ? {
              format: headerFormat,
              example: headerExample.trim() || undefined,
            }
          : undefined;
    const btns: WaButtonInput[] = buttons.map((b) =>
      b.type === 'URL'
        ? {
            type: 'URL',
            text: b.text,
            url: b.url,
            example: b.example.trim() || undefined,
          }
        : b.type === 'PHONE_NUMBER'
          ? { type: 'PHONE_NUMBER', text: b.text, phoneNumber: b.phoneNumber }
          : { type: 'QUICK_REPLY', text: b.text },
    );
    // MARKETING templates MUST offer a way out; ensureOptOut adds the standard
    // line when the author didn't. See lib/waTemplate.ts for why (2026-08-28:
    // Meta spam notice, sending number to RED, because recipients who wanted out
    // could only reach for "Report spam").
    return ensureOptOut({
      name: name.trim(),
      language: SUBMIT_LOCALE[languageCode],
      category,
      bodyText,
      bodyExample: bodyExample.slice(0, bodyParams.count),
      paramMap,
      header,
      footer: footer.trim() || undefined,
      buttons: btns,
    });
  }, [
    name,
    languageCode,
    category,
    bodyText,
    bodyExample,
    bodyParams.count,
    paramMap,
    headerFormat,
    headerText,
    headerExample,
    footer,
    buttons,
  ]);

  // Buttons rendered in the bubble (labels only — links/numbers aren't shown on a
  // received message). Blank-label buttons still render so the layout is live.
  // Sourced from createInput, NOT the raw `buttons` state, so an auto-added
  // opt-out button appears in the preview exactly as the recipient will see it.
  const previewButtons = useMemo<PreviewButton[]>(
    () =>
      (createInput.buttons ?? []).map((b) =>
        b.type === 'URL'
          ? { type: 'URL', label: b.text }
          : b.type === 'PHONE_NUMBER'
            ? { type: 'PHONE_NUMBER', label: b.text }
            : { type: 'QUICK_REPLY', label: b.text },
      ),
    [createInput.buttons],
  );

  const optOutNote = optOutAdditionNote(optOutAdded);

  // Client-mirrored Meta validation — the Submit button gates on the same checks
  // the route runs server-side, so a submit the route would reject can't fire.
  const submitProblems = useMemo(
    () => validateCreateInput(createInput),
    [createInput],
  );
  // !saving guards a save→submit race.
  const canSubmit =
    submitProblems.length === 0 &&
    !submitting &&
    submitted === null &&
    !saving &&
    !alreadyInMeta;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const res = await callPropelRoute<{
      ok?: boolean;
      templateId?: string;
      error?: string;
      operatorAction?: string;
    }>('/marketing/save-template', {
      ...(initial ? { templateId: initial.id } : {}),
      name: name.trim(),
      languageCode,
      category,
      bodyText,
      paramMap,
      bodyExample: bodyExample.slice(0, bodyParams.count),
      status,
    });
    setSaving(false);
    if (
      res === null ||
      (res.error !== undefined && res.error !== '') ||
      res.templateId === undefined
    ) {
      notify(
        res?.operatorAction || res?.error || 'Could not save the template.',
        'error',
      );
      return;
    }
    notify(initial ? 'Template updated.' : 'Template created.', 'success');
    onClose(true);
  };

  const submitToMeta = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await callPropelRoute<{
      ok?: boolean;
      id?: string;
      status?: string;
      error?: string;
      code?: string;
      operatorAction?: string;
      warning?: string;
    }>('/marketing/wa-template-create', {
      ...(initial ? { templateId: initial.id } : {}),
      name: name.trim(),
      languageCode,
      language: SUBMIT_LOCALE[languageCode],
      category,
      bodyText,
      bodyExample: createInput.bodyExample,
      paramMap,
      header: createInput.header,
      footer: createInput.footer,
      buttons: createInput.buttons,
    });
    setSubmitting(false);
    if (res === null || res.error !== undefined || res.id === undefined) {
      const msg =
        res?.code === 'ENV_MISSING'
          ? res.error || "WhatsApp isn't configured on this environment."
          : res?.error || 'Could not submit the template to Meta.';
      setSubmitError(res?.code === 'ENV_MISSING' ? null : msg);
      notify(
        res?.code === 'ENV_MISSING' ? msg : res?.operatorAction || msg,
        'error',
      );
      return;
    }
    setSubmitted({ id: res.id });
    if (res.warning !== undefined && res.warning !== '')
      notify(res.warning, 'info');
    notify('Submitted to Meta — pending approval.', 'success');
  };

  const headerIsMedia =
    headerFormat === 'IMAGE' ||
    headerFormat === 'VIDEO' ||
    headerFormat === 'DOCUMENT';

  return (
    <Modal
      opened
      onClose={() => (submitted ? onClose(true) : onClose(false))}
      title={initial ? 'Edit template' : 'New WhatsApp template'}
      size="lg"
      zIndex={5000}
    >
      <Stack gap="md">
        <TextInput
          label="Template name"
          description="Meta format — lowercase letters, digits and underscores."
          value={name}
          onChange={(e) =>
            setName(
              e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            )
          }
          placeholder="listing_launch_en"
          styles={{ input: { fontFamily: 'monospace' } }}
          error={
            name.trim() !== '' && !nameOk ? 'Invalid name format' : undefined
          }
        />

        <Group gap="xl" wrap="wrap">
          <Box>
            <Text size="sm" fw={600} mb={4}>
              Language
            </Text>
            <SegmentedControl
              value={languageCode}
              onChange={(v) => setLanguageCode(v as 'EN' | 'AR')}
              data={[
                { label: 'EN', value: 'EN' },
                { label: 'AR', value: 'AR' },
              ]}
            />
          </Box>
          <Box>
            <Text size="sm" fw={600} mb={4}>
              Category
            </Text>
            <SegmentedControl
              value={category}
              onChange={(v) => setCategory(v as 'MARKETING' | 'UTILITY')}
              data={[
                { label: 'Marketing', value: 'MARKETING' },
                { label: 'Utility', value: 'UTILITY' },
              ]}
            />
            {category === 'UTILITY' ? (
              <Text size="xs" c="dimmed" mt={6} maw={420}>
                Campaigns are MARKETING — Meta recategorizes promotional content
                submitted as Utility.
              </Text>
            ) : null}
          </Box>
        </Group>

        {/* AI draft bench — brief → Meta-compliant draft that prefills the editor.
            Never bypasses Meta approval; the operator reviews/edits and submits. */}
        <Paper
          withBorder
          radius="md"
          p="sm"
          style={{ borderStyle: 'dashed' }}
        >
          <Group
            justify="space-between"
            align="center"
            style={{ cursor: 'pointer' }}
            onClick={() => setAiOpen((o) => !o)}
          >
            <Group gap={8} wrap="nowrap">
              <IconSparkles size={16} color="var(--mantine-color-red-6)" />
              <Text size="sm" fw={600}>
                Draft with AI
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {aiOpen ? 'Hide' : 'Write from a brief'}
            </Text>
          </Group>
          <Collapse in={aiOpen}>
            <Stack gap="sm" mt="sm">
              <Textarea
                label="Brief"
                description="Describe the message — the AI drafts a Meta-compliant template you can edit."
                value={aiBrief}
                onChange={(e) => setAiBrief(e.currentTarget.value)}
                placeholder="Invite a cold lead to view a new 2-bed Marina listing; end with a viewing prompt."
                autosize
                minRows={2}
                disabled={aiBusy}
              />
              <Group gap="sm" align="flex-end">
                <Select
                  label="Tone"
                  w={180}
                  value={aiTone}
                  onChange={(v) => setAiTone(v ?? 'FRIENDLY')}
                  data={AI_TONES}
                  disabled={aiBusy}
                  comboboxProps={{ zIndex: 5100 }}
                />
                <Button
                  color="red"
                  leftSection={<IconSparkles size={15} />}
                  loading={aiBusy}
                  disabled={aiBrief.trim() === ''}
                  onClick={() => void draftWithAi()}
                >
                  Draft with AI
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                Uses the {category === 'UTILITY' ? 'Utility' : 'Marketing'} rules and{' '}
                {languageCode === 'AR' ? 'Arabic' : 'English'} from above. The draft is
                pre-checked for Meta compliance; you still submit it for approval.
              </Text>
            </Stack>
          </Collapse>
        </Paper>

        <Box>
          <Textarea
            label="Body — exactly as submitted to Meta"
            dir={rtl ? 'rtl' : 'ltr'}
            value={bodyText}
            onChange={(e) => setBodyText(e.currentTarget.value)}
            placeholder={'Hi {{1}}, {{2}} is now live. Reply STOP to opt out.'}
            autosize
            minRows={5}
          />
          <Group gap={6} mt="xs">
            <Text size="xs" tt="uppercase" c="dimmed" ff="monospace">
              add field
            </Text>
            {DRAIN_POPULATED_FIELDS.map((f) => (
              <Button
                key={f}
                size="compact-xs"
                variant="light"
                color="blue"
                ff="monospace"
                onClick={() => appendParam(f)}
                title={`Append {{${paramMap.length + 1}}} bound to ${f}`}
              >
                + {f}
              </Button>
            ))}
            {paramMap.length > 0 ? (
              <Button
                size="compact-xs"
                variant="default"
                onClick={clearParams}
                title="Remove all {{n}} placeholders and bindings"
              >
                clear fields
              </Button>
            ) : null}
          </Group>
          {paramMap.length > 0 ? (
            <Text size="xs" c="dimmed" ff="monospace" mt={6}>
              {paramMap.map((k, i) => `{{${i + 1}}} ← ${k}`).join('  ·  ')}
            </Text>
          ) : null}
          {WA_NOT_YET_FILLABLE.length > 0 ? (
            <Text size="xs" c="dimmed" mt={6}>
              Also in the vocabulary, not yet auto-filled:{' '}
              {WA_NOT_YET_FILLABLE.join(', ')}.
            </Text>
          ) : null}
          {badPlaceholder ? (
            <Text size="xs" c="red" mt={6}>
              WhatsApp uses numbered placeholders only — {'{{1}}'}, {'{{2}}'}…
              Remove any {'{{name}}'}-style tokens from the body.
            </Text>
          ) : !seqOk ? (
            <Text size="xs" c="red" mt={6}>
              {paramMap.length === 0
                ? 'Remove the {{n}} placeholders from the body, or add fields to bind them.'
                : `Every bound field must appear as {{1}}…{{${paramMap.length}}} — numbered in range, no gaps.`}
            </Text>
          ) : null}
        </Box>

        {/* Live WhatsApp chat-bubble preview — header + filled body + footer +
            buttons, rendered as the recipient sees it on a phone. */}
        <Box>
          <Group justify="space-between" align="center" mb={6}>
            <Text size="sm" fw={600}>
              WhatsApp preview
            </Text>
            <Text size="xs" c="dimmed">
              sample values · live
            </Text>
          </Group>
          <WaBubblePreview
            header={previewHeader}
            body={previewBody}
            footer={createInput.footer ?? ''}
            buttons={previewButtons}
            rtl={rtl}
          />
        </Box>

        {/* Sample values — Meta needs one per {{n}} to review */}
        {bodyParams.ok && bodyParams.count > 0 ? (
          <Box>
            <Text size="sm" fw={600} mb={6}>
              {`Sample values — for Meta’s review of {{1}}…{{${bodyParams.count}}}`}
            </Text>
            <Stack gap={8}>
              {Array.from({ length: bodyParams.count }, (_, i) => (
                <Group key={i} gap={8} wrap="nowrap">
                  <Text ff="monospace" size="sm" c="blue" w={38}>
                    {`{{${i + 1}}}`}
                  </Text>
                  <TextInput
                    style={{ flex: 1 }}
                    value={bodyExample[i] ?? ''}
                    onChange={(e) => {
                      const next = [...bodyExample];
                      next[i] = e.currentTarget.value;
                      setBodyExample(next);
                    }}
                    placeholder={i === 0 ? 'Sara' : 'Marina View 2BR'}
                  />
                </Group>
              ))}
            </Stack>
            <Text size="xs" c="dimmed" mt={5}>
              Examples only — real sends fill from each recipient’s data.
            </Text>
          </Box>
        ) : null}

        {/* Optional HEADER */}
        <Box>
          <Text size="sm" fw={600} mb={6}>
            Header (optional)
          </Text>
          <SegmentedControl
            value={headerFormat}
            onChange={(v) => setHeaderFormat(v as HeaderFormat)}
            data={[
              { label: 'None', value: 'NONE' },
              { label: 'Text', value: 'TEXT' },
              { label: 'Image', value: 'IMAGE' },
              { label: 'Video', value: 'VIDEO' },
              { label: 'Document', value: 'DOCUMENT' },
            ]}
          />
          {headerFormat === 'TEXT' ? (
            <Stack gap={8} mt={10}>
              <TextInput
                value={headerText}
                onChange={(e) => setHeaderText(e.currentTarget.value)}
                placeholder="A short header line"
                maxLength={60}
              />
              <Text size="xs" c="dimmed">
                Up to 60 characters; a static line shown above the message. A
                text header may use at most one variable, written {'{{1}}'}.
              </Text>
              {/\{\{\s*1\s*\}\}/.test(headerText) ? (
                <TextInput
                  label="Header variable example"
                  value={headerExample}
                  onChange={(e) => setHeaderExample(e.currentTarget.value)}
                  placeholder="Sample value for {{1}}"
                />
              ) : null}
            </Stack>
          ) : headerIsMedia ? (
            <Stack gap={8} mt={10}>
              <TextInput
                label="Sample media handle (optional)"
                value={headerExample}
                onChange={(e) => setHeaderExample(e.currentTarget.value)}
                placeholder="Meta media handle from the resumable upload API"
              />
              <Text size="xs" c="dimmed">
                Media headers need a send-time asset the campaign sender can’t
                supply yet — submitting one will be blocked below. Use a static
                text header for now.
              </Text>
            </Stack>
          ) : null}
        </Box>

        {/* Optional FOOTER */}
        <TextInput
          label="Footer (optional)"
          description="Up to 60 characters; no variables."
          value={footer}
          onChange={(e) => setFooter(e.currentTarget.value)}
          placeholder="RE/MAX Hub Dubai"
          maxLength={60}
        />

        {/* BUTTONS — carries the mandatory opt-out on marketing templates */}
        <Box>
          <Text size="sm" fw={600} mb={6}>
            Buttons (optional)
          </Text>
          {optOutNote !== null ? (
            <Text size="xs" c="dimmed" mb={10}>
              {optOutNote} Anyone who taps it (or replies STOP) is removed from
              every future campaign automatically. That exit is what stops people
              reporting us as spam instead — which is what puts the number at
              risk of being shut off. You can reword it, but not remove it.
            </Text>
          ) : null}
          {buttons.length > 0 ? (
            <Stack gap={10} mb={10}>
              {buttons.map((b, i) => (
                <Box
                  key={i}
                  style={{
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <Group gap={8} mb={8}>
                    <Text size="xs" fw={600} c="dimmed">
                      {BUTTON_KINDS.find((k) => k.v === b.type)?.label}
                    </Text>
                    <Button
                      ml="auto"
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconTrash size={12} />}
                      onClick={() =>
                        setButtons((arr) => arr.filter((_, j) => j !== i))
                      }
                    >
                      Remove
                    </Button>
                  </Group>
                  <Stack gap={8}>
                    <TextInput
                      value={b.text}
                      onChange={(e) =>
                        setButtons((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, text: e.currentTarget.value } : x,
                          ),
                        )
                      }
                      placeholder="Button label (max 25 chars)"
                      maxLength={25}
                    />
                    {b.type === 'URL' ? (
                      <>
                        <TextInput
                          value={b.url}
                          onChange={(e) =>
                            setButtons((arr) =>
                              arr.map((x, j) =>
                                j === i && x.type === 'URL'
                                  ? { ...x, url: e.currentTarget.value }
                                  : x,
                              ),
                            )
                          }
                          placeholder="https://example.com/deals"
                        />
                        {bodyParamCount(b.url).count > 0 ? (
                          <Text size="xs" c="red">
                            Use a fixed link — dynamic {'{{1}}'} URLs aren’t
                            supported by the campaign sender yet.
                          </Text>
                        ) : null}
                      </>
                    ) : b.type === 'PHONE_NUMBER' ? (
                      <TextInput
                        value={b.phoneNumber}
                        onChange={(e) =>
                          setButtons((arr) =>
                            arr.map((x, j) =>
                              j === i && x.type === 'PHONE_NUMBER'
                                ? { ...x, phoneNumber: e.currentTarget.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="+15550051310"
                      />
                    ) : null}
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : null}
          <Group gap={8}>
            {BUTTON_KINDS.map((k) => (
              <Button
                key={k.v}
                size="compact-xs"
                variant="light"
                color="blue"
                onClick={() => setButtons((arr) => [...arr, newButton(k.v)])}
              >
                + {k.label}
              </Button>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Up to 10 buttons; at most 2 URL and 1 call button.
          </Text>
        </Box>

        {/* Spam-risk grade — ADVISORY, sits directly above the hard blockers so
            the author reads "will this get us reported?" and "will Meta accept
            it?" as one thought. It scores `createInput`, which is already
            ensureOptOut-normalized, so the grade describes the message that will
            actually be sent rather than the raw draft. It NEVER gates Submit —
            only submitProblems below does that. */}
        <WaTemplateQualityPanel
          input={createInput}
          metaQualityScore={initial?.metaQualityScore}
        />

        {/* Submit state / problems */}
        {submitted ? (
          <Alert color="yellow" title="Submitted — pending Meta approval">
            Meta is reviewing this template (id {submitted.id}). It can’t send
            until APPROVED — the next template sync will update its status here.
          </Alert>
        ) : submitError ? (
          <Alert color="red" title="Meta rejected the template">
            {submitError}
          </Alert>
        ) : submitProblems.length > 0 ? (
          <Alert
            color="yellow"
            title={
              submitProblems.length === 1
                ? 'Can’t submit to Meta yet — one thing to fix:'
                : `Can’t submit to Meta yet — ${submitProblems.length} things to fix:`
            }
          >
            <List size="sm" spacing={4}>
              {submitProblems.map((p, i) => (
                <List.Item key={i}>{p}</List.Item>
              ))}
            </List>
            {submitProblems.some((p) => /example/i.test(p)) ? (
              <Text size="xs" c="dimmed" mt={8}>
                Fill the “Sample values” boxes above — one example per {'{{n}}'}{' '}
                placeholder — and Submit lights up.
              </Text>
            ) : null}
          </Alert>
        ) : null}

        <Box>
          <Text size="sm" fw={600} mb={6}>
            Status — mirrors Meta’s review; refresh with “Sync from Meta”
          </Text>
          <Group gap={6}>
            {TPL_STATUSES.map((s) => {
              const lockReviewed = REVIEWED_STATES.has(s) && reviewedDirty;
              return (
                <Button
                  key={s}
                  size="compact-xs"
                  variant={status === s ? 'filled' : 'default'}
                  color={status === s ? 'red' : undefined}
                  disabled={lockReviewed}
                  onClick={() => !lockReviewed && setStatus(s)}
                  title={
                    lockReviewed
                      ? 'Edited content must be re-submitted to Meta before it can be marked reviewed'
                      : undefined
                  }
                >
                  {titleCase(s)}
                </Button>
              );
            })}
          </Group>
          {reviewedDirty &&
          (initial?.status === 'APPROVED' ||
            initial?.status === 'SUBMITTED') ? (
            <Text size="xs" c="orange" mt={6}>
              You edited a Meta-reviewed field — this template must be
              re-submitted to Meta, so it can’t stay {titleCase(initial.status)}
              .
            </Text>
          ) : status === 'APPROVED' ? (
            <Text size="xs" c="orange" mt={6}>
              APPROVED makes this template sendable — flip it only after
              WhatsApp Manager shows Approved for this exact body.
            </Text>
          ) : null}
          {initial?.rejectionReason ? (
            <Text size="xs" c="dimmed" mt={6}>
              Meta’s rejection reason: {initial.rejectionReason}
            </Text>
          ) : null}
        </Box>

        {/* Footer actions */}
        {submitted ? (
          <Group justify="flex-end">
            <Button color="red" onClick={() => onClose(true)}>
              Done
            </Button>
          </Group>
        ) : (
          <Group justify="space-between">
            <Button
              variant="default"
              onClick={() => onClose(false)}
              disabled={saving || submitting}
            >
              Cancel
            </Button>
            <Group gap="sm">
              <Button
                variant="light"
                color="red"
                onClick={() => void save()}
                loading={saving}
                disabled={!canSave || submitting}
              >
                Save draft
              </Button>
              {alreadyInMeta ? (
                <Text size="xs" c="dimmed">
                  Managed in Meta
                </Text>
              ) : (
                <Button
                  color="red"
                  onClick={() => void submitToMeta()}
                  loading={submitting}
                  disabled={!canSubmit}
                  title={
                    submitProblems.length > 0
                      ? submitProblems.join(' ')
                      : 'Submit this template to Meta for approval'
                  }
                >
                  Submit to Meta
                </Button>
              )}
            </Group>
          </Group>
        )}
      </Stack>
    </Modal>
  );
};
