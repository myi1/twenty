import { useCallback, useEffect, useState } from 'react';
import {
  createCounterpartyPerson,
  linkCounterpartyToAgreement,
  searchCounterpartyPeople,
} from '@/propel/lib/a2aCrm';
import {
  describeSendOutcome,
  summariseDistribution,
  type SendOutcome,
} from '@/propel/lib/a2aSendOutcome';
import { planResume } from '@/propel/lib/a2aResume';
import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import {
  type A2ADocumentStatus,
  type A2APrefill,
  type A2AStep,
  type A2AVariant,
  type CounterpartyDraft,
  type CounterpartyPerson,
  type CreateDraftRequest,
  type CreateDraftResponse,
  type DealStateResponse,
  type DiscardRequest,
  type DiscardResponse,
  type FinalizeResponse,
  type SendChannel,
  type SendRequest,
  type SendResponse,
  type StatusResponse,
} from '@/propel/types/a2a';

// Drives the A2A Studio for ONE opportunity. The step machine:
//
//   prepare → create-draft →  isRera ? signEmbed : (finalize → )  → send → done
//                                       └ embed our recipient      └ junior bake
//
// All server calls go through callPropelRoute('/a2a/*') (server-derived identity —
// we NEVER send an acting-id); the only direct GraphQL writes are the counterparty
// Person create/search/link (a2aCrm.ts), which run under the agent's own token so
// propel-rls applies. Fails soft exactly like useOneOnOneRunner: a null route
// response → the `error` step (a `missing` checklist surfaces as a 422 notice),
// never a throw. An un-sent draft is discarded on unmount (orphan cleanup, plan §8c).
//
// TASK 38 (2026-09-12) — aligned to the CRM routes as they parse (not as remembered):
//   · send and discard carry `documensoDocumentId` — the CRM send route REQUIRES
//     both ids and refused every send; discard needs it to delete the envelope.
//   · create-draft carries the linked counterparty's email (the CRM route puts it
//     on the Agent slot we do not play). Name mapping (commission share → A/B
//     split, price, address, buyer) is the CRM route's job, not this hook's.
//   · send reads the service's per-leg `distribution` (a2aSendOutcome.ts): the
//     service answers ok:true even when nothing was delivered, so `ok` alone was
//     a lie on the screen. `sendMessage` is the one truthful sentence.
//   · the Documenso id is a NUMBER on the wire; it is stringified once here.

// What the hero needs to keep around once a draft exists.
export interface A2ADraft {
  a2aDocumentId: string;
  documensoDocumentId: string;
  ourRecipientToken: string | null;
  counterpartyRecipientToken: string | null;
  isRera: boolean;
}

export type SendResult = { ok: boolean; message: string };

export interface A2AStudioState {
  step: A2AStep;
  /** Why we're in `error` / a 422 readiness checklist, if any. */
  errorMessage: string | null;
  missing: string[] | null;
  /** The CRM prefill echoed back by create-draft (or the seed prefill). */
  prefill: A2APrefill;
  draft: A2ADraft | null;
  status: A2ADocumentStatus | null;
  signedPdfUrl: string | null;
  auditUrl: string | null;
  /** The linked counterparty Person, if one is set. */
  counterparty: CounterpartyPerson | null;
  /** What the last send really did, from the service's own report. */
  sendOutcome: SendOutcome | null;
  sendMessage: string | null;
  /** The counterparty's signing link — set ONLY from a send (or from an
   * agreement we resumed, whose link the service wrote at send time). Never the
   * link create-draft returned: that one is resolved before our side is baked and
   * is dead by the time anyone could forward it (task 49, proven on prod). */
  shareUrl: string | null;
  /** True while the opening read is in flight. */
  resuming: boolean;
  /** An earlier, unfinished agreement exists for this deal. We do NOT resume one
   * of these (its Documenso draft may be long gone) — the screen warns instead of
   * silently creating a second agreement. */
  existingDraftNotice: { status: string; createdAt: string | null } | null;
  creating: boolean;
  finalizing: boolean;
  sending: boolean;

  setPrefill: (patch: Partial<A2APrefill>) => void;
  createDraft: () => Promise<void>;
  /** Called by DocumensoEmbed onDocumentCompleted (RERA path). */
  onEmbedCompleted: () => void;
  send: (channels: SendChannel[]) => Promise<SendResult>;
  searchPeople: (term: string) => Promise<CounterpartyPerson[]>;
  linkCounterparty: (person: CounterpartyPerson) => Promise<boolean>;
  createCounterparty: (draft: CounterpartyDraft) => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  reset: () => void;
}

const POLL_INTERVAL_MS = 6000;

const idToString = (v: unknown): string =>
  typeof v === 'number' || typeof v === 'string' ? String(v) : '';

export const useA2AStudio = (
  opportunityId: string | null,
  variant: A2AVariant,
  seedPrefill: A2APrefill,
): A2AStudioState => {
  const [step, setStep] = useState<A2AStep>('prepare');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [prefill, setPrefillState] = useState<A2APrefill>(seedPrefill);
  const [draft, setDraft] = useState<A2ADraft | null>(null);
  const [status, setStatus] = useState<A2ADocumentStatus | null>(null);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [auditUrl, setAuditUrl] = useState<string | null>(null);
  const [counterparty, setCounterparty] = useState<CounterpartyPerson | null>(
    null,
  );
  const [sendOutcome, setSendOutcome] = useState<SendOutcome | null>(null);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [existingDraftNotice, setExistingDraftNotice] = useState<{
    status: string;
    createdAt: string | null;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sending, setSending] = useState(false);

  // A single stable mutable holder for the values the stable callbacks + the
  // unmount cleanup need to read at call-time (the live draft + whether we've
  // sent). Lazily initialized via useState so the object identity is stable
  // across renders without `useRef` (Twenty's no-state-useref rule reserves
  // useRef for DOM element refs only). We keep it in sync each render.
  const [live] = useState<{ draft: A2ADraft | null; sent: boolean }>(() => ({
    draft: null,
    sent: false,
  }));
  live.draft = draft;

  const setPrefill = useCallback((patch: Partial<A2APrefill>) => {
    setPrefillState((cur) => ({ ...cur, ...patch }));
  }, []);

  const createDraft = useCallback(async () => {
    if (opportunityId === null || opportunityId === '') {
      setStep('error');
      setErrorMessage(
        'No opportunity in context — open A2A Studio from a deal.',
      );
      return;
    }
    setCreating(true);
    setErrorMessage(null);
    setMissing(null);
    try {
      const body: CreateDraftRequest = {
        opportunityId,
        variant,
        ...prefill,
        // The linked counterparty's email goes on the agreement's other Agent
        // slot (the CRM route decides which). A typed prefill value wins.
        ...(counterparty?.email != null &&
        counterparty.email !== '' &&
        (prefill.counterpartyEmail === undefined ||
          prefill.counterpartyEmail === '')
          ? { counterpartyEmail: counterparty.email }
          : {}),
      };
      const res = await callPropelRoute<CreateDraftResponse>(
        '/a2a/create-draft',
        body,
      );
      if (res === null) {
        setStep('error');
        setErrorMessage('Could not create the draft. Please try again.');
        return;
      }
      if (res.missing !== undefined && res.missing.length > 0) {
        // 422 not-ready — stay on prepare, surface the checklist.
        setMissing(res.missing);
        setErrorMessage(
          res.error ?? 'A few details are still needed before drafting.',
        );
        return;
      }
      if (res.error !== undefined || res.a2aDocumentId === undefined) {
        setStep('error');
        setErrorMessage(res.error ?? 'Could not create the draft.');
        return;
      }
      const next: A2ADraft = {
        a2aDocumentId: res.a2aDocumentId,
        documensoDocumentId: idToString(res.documensoDocumentId),
        ourRecipientToken: res.ourRecipientToken ?? null,
        counterpartyRecipientToken: res.counterpartyRecipientToken ?? null,
        isRera: res.isRera === true,
      };
      setDraft(next);
      setStatus('DRAFT');
      if (res.prefill !== undefined) {
        setPrefillState((cur) => ({ ...cur, ...res.prefill }));
      }

      if (next.isRera) {
        // RERA agent signs personally in the embed.
        if (next.ourRecipientToken === null) {
          setStep('error');
          setErrorMessage(
            'The signing session is missing — the draft was created but cannot be signed here.',
          );
          return;
        }
        setStep('signEmbed');
      } else {
        // Junior: doc-service bakes the registered agent's signature/stamp; there
        // is no our-side embed (finalize removes our recipient). Bake then skip
        // straight to send. `isRera:false` = today's bake path; the signing model
        // flag (`bakeOurSide`) is deliberately never sent (founder decision 4).
        setStep('bakeJunior');
        setFinalizing(true);
        const fin = await callPropelRoute<FinalizeResponse>('/a2a/finalize', {
          a2aDocumentId: next.a2aDocumentId,
          documensoDocumentId: next.documensoDocumentId,
          isRera: false,
        });
        setFinalizing(false);
        if (fin === null || fin.error !== undefined) {
          setStep('error');
          setErrorMessage(
            fin?.error ?? 'Could not apply your brokerage signature.',
          );
          return;
        }
        setStep('send');
      }
    } catch {
      setStep('error');
      setErrorMessage('Could not create the draft.');
    } finally {
      setCreating(false);
    }
  }, [opportunityId, variant, prefill, counterparty]);

  const onEmbedCompleted = useCallback(() => {
    // Our recipient finished signing in the embed → move to send.
    setStep('send');
  }, []);

  const refreshStatus = useCallback(async () => {
    const d = live.draft;
    if (d === null) return;
    const res = await callPropelRoute<StatusResponse>('/a2a/status', {
      a2aDocumentId: d.a2aDocumentId,
    });
    if (res === null || res.error !== undefined) return;
    if (res.status !== undefined) setStatus(res.status);
    if (res.signedPdfUrl !== undefined) setSignedPdfUrl(res.signedPdfUrl);
    if (res.auditUrl !== undefined) setAuditUrl(res.auditUrl);
    if (res.status === 'SIGNED') setStep('done');
  }, [live]);

  const send = useCallback(
    async (channels: SendChannel[]): Promise<SendResult> => {
      const d = live.draft;
      if (d === null) {
        return { ok: false, message: 'There is no draft to send yet.' };
      }
      setSending(true);
      try {
        const body: SendRequest = {
          a2aDocumentId: d.a2aDocumentId,
          documensoDocumentId: d.documensoDocumentId,
          channels,
          ...(counterparty !== null
            ? {
                counterpartyPersonId: counterparty.id,
                // Greeting for the CRM-sent link email; never used for routing.
                counterpartyName: counterparty.name,
                ...(counterparty.phone !== null && counterparty.phone !== ''
                  ? { counterpartyPhone: counterparty.phone }
                  : {}),
                ...(counterparty.email !== null && counterparty.email !== ''
                  ? { counterpartyEmail: counterparty.email }
                  : {}),
              }
            : {}),
        };
        const res = await callPropelRoute<SendResponse>('/a2a/send', body);
        if (res === null || res.error !== undefined || res.ok === false) {
          const message = res?.error ?? 'Could not send to the counterparty.';
          setErrorMessage(message);
          return { ok: false, message };
        }
        // The envelope is activated and the CRM row is OUT_FOR_SIGNATURE. What
        // reached the counterparty is a separate question — answered by the
        // service's per-leg report, never by `ok`.
        live.sent = true;
        setStatus(res.status ?? 'OUT_FOR_SIGNATURE');
        // The ONLY link we will ever hand the agent: the one this send resolved
        // off the live document. If the service could not resolve one, we hold
        // nothing rather than offering the dead pre-bake link (task 49).
        const returnedUrl = res.counterpartySigningUrl ?? null;
        if (returnedUrl !== null) setShareUrl(returnedUrl);
        const outcome = summariseDistribution(res.distribution);
        const finalOutcome: SendOutcome = {
          ...outcome,
          linkReady:
            outcome.linkReady || returnedUrl !== null || shareUrl !== null,
        };
        const message = describeSendOutcome(
          finalOutcome,
          counterparty?.name ?? null,
        );
        setSendOutcome(finalOutcome);
        setSendMessage(message);
        setErrorMessage(null);
        return { ok: true, message };
      } finally {
        setSending(false);
      }
    },
    [counterparty, live, shareUrl],
  );

  const searchPeople = useCallback(
    (term: string) => searchCounterpartyPeople(term),
    [],
  );

  const linkCounterparty = useCallback(
    async (person: CounterpartyPerson): Promise<boolean> => {
      const d = live.draft;
      // Always remember the selection so SendPanel can light its channels even
      // before a draft exists (the form may set the counterparty first).
      setCounterparty(person);
      if (d === null) return true;
      return linkCounterpartyToAgreement(d.a2aDocumentId, person.id);
    },
    [live],
  );

  const createCounterparty = useCallback(
    async (draftPerson: CounterpartyDraft): Promise<boolean> => {
      const created = await createCounterpartyPerson(draftPerson);
      if (created === null) return false;
      return linkCounterparty(created);
    },
    [linkCounterparty],
  );

  const reset = useCallback(() => {
    live.sent = false;
    live.draft = null;
    setStep('prepare');
    setErrorMessage(null);
    setMissing(null);
    setDraft(null);
    setStatus(null);
    setSignedPdfUrl(null);
    setAuditUrl(null);
    setCounterparty(null);
    setSendOutcome(null);
    setSendMessage(null);
    setShareUrl(null);
    setExistingDraftNotice(null);
  }, [live]);

  // ── What this deal already has (task 52) ──────────────────────────────────
  // Proven on prod: reopening the Studio on a deal whose agreement was already
  // out for signature showed the blank prepare form and a "Create draft" button.
  // One read at mount answers it. An agreement that is already out for signature
  // or signed is RESUMED; an older unfinished draft is only reported, because its
  // Documenso draft may be long gone and silently continuing it would be a guess.
  useEffect(() => {
    if (opportunityId === null || opportunityId === '') return;
    let cancelled = false;
    setResuming(true);
    void (async () => {
      const res = await callPropelRoute<DealStateResponse>('/a2a/deal-state', {
        opportunityId,
        variant,
      });
      if (cancelled) return;
      if (res !== null && res.error === undefined) {
        // Anything the agent (or the launcher) already typed wins over the deal.
        if (res.prefill !== undefined) {
          setPrefillState((cur) => ({ ...res.prefill, ...cur }));
        }
        const plan = planResume(res.agreement);
        if (plan.kind === 'resume') {
          const resumed: A2ADraft = {
            a2aDocumentId: plan.draft.a2aDocumentId,
            documensoDocumentId: plan.draft.documensoDocumentId,
            ourRecipientToken: null,
            counterpartyRecipientToken: null,
            isRera: false,
          };
          setDraft(resumed);
          live.draft = resumed;
          // ⚠️ plan.markSent is always true, and it must be applied: the unmount
          // cleanup discards an UN-SENT draft, so without this an agent who opens
          // the deal and navigates away would void a live agreement.
          live.sent = plan.markSent;
          setStatus(plan.status);
          setShareUrl(plan.shareUrl);
          setSignedPdfUrl(plan.signedPdfUrl);
          setAuditUrl(plan.auditUrl);
          setStep(plan.step);
        } else if (plan.kind === 'notice') {
          setExistingDraftNotice({
            status: plan.status,
            createdAt: plan.createdAt,
          });
        }
      }
      setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
    // Reads once per deal/variant; the form owns everything after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, variant]);

  // Poll status while the doc is out for signature, so the strip + the flip to
  // `done` happen without a manual refresh.
  useEffect(() => {
    if (draft === null) return;
    if (status !== 'OUT_FOR_SIGNATURE') return;
    const id = setInterval(() => {
      void refreshStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [draft, status, refreshStatus]);

  // Orphan cleanup (plan §8c): if the agent abandons an un-sent draft (unmount),
  // discard it server-side so we don't leak a Documenso draft + DRAFT
  // agreementDocument. Both ids: with only the CRM id the service voids the row
  // but cannot delete the envelope. Fire-and-forget — the page is already gone.
  useEffect(() => {
    return () => {
      const d = live.draft;
      if (d !== null && !live.sent) {
        const body: DiscardRequest = {
          a2aDocumentId: d.a2aDocumentId,
          ...(d.documensoDocumentId !== ''
            ? { documensoDocumentId: d.documensoDocumentId }
            : {}),
        };
        void callPropelRoute<DiscardResponse>('/a2a/discard', body);
      }
    };
  }, [live]);

  return {
    step,
    errorMessage,
    missing,
    prefill,
    draft,
    status,
    signedPdfUrl,
    auditUrl,
    counterparty,
    sendOutcome,
    sendMessage,
    shareUrl,
    resuming,
    existingDraftNotice,
    creating,
    finalizing,
    sending,
    setPrefill,
    createDraft,
    onEmbedCompleted,
    send,
    searchPeople,
    linkCounterparty,
    createCounterparty,
    refreshStatus,
    reset,
  };
};
