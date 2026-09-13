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
export type A2ADispatchState = 'never' | 'pending' | 'unknown' | 'activated';
export type A2AFinalizationState = 'none' | 'pending' | 'unknown';
export type A2ALookupState = 'pending' | 'clear' | 'blocked' | 'unavailable';

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
  dispatchState: A2ADispatchState;
  finalizationState: A2AFinalizationState;
  lookupState: A2ALookupState;
  canCreateDraft: boolean;
  canSend: boolean;

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

type AttemptGuard = {
  draft: A2ADraft;
  state: Exclude<A2ADispatchState, 'never'>;
};

type FinalizationGuard = {
  draft: A2ADraft;
  state: Exclude<A2AFinalizationState, 'none'>;
};

// Page-lifetime write-suppression only. The trusted member id, opportunity and
// variant prevent one user's/document's attempt from blocking another. This map
// survives React unmount/remount in the same loaded page, but deliberately is not
// a permission/cache authority and does not claim reload, crash, or cross-tab
// durability. Durable reconciliation belongs to the held J3/J4 authority work.
const attemptGuards = new Map<string, AttemptGuard>();
const finalizationGuards = new Map<string, FinalizationGuard>();

const isSameDraft = (left: A2ADraft, right: A2ADraft): boolean =>
  left.a2aDocumentId === right.a2aDocumentId &&
  left.documensoDocumentId === right.documensoDocumentId;

const finalizationGuardFor = (
  scope: string | null,
  draft: A2ADraft | null,
): FinalizationGuard | undefined => {
  if (scope === null || draft === null) return undefined;
  const guard = finalizationGuards.get(scope);
  return guard !== undefined && isSameDraft(guard.draft, draft)
    ? guard
    : undefined;
};

const scopeKeyFor = (
  memberId: string | null,
  opportunityId: string | null,
  variant: A2AVariant,
): string | null =>
  memberId !== null &&
  memberId !== '' &&
  opportunityId !== null &&
  opportunityId !== ''
    ? JSON.stringify([memberId, opportunityId, variant])
    : null;

const isPublicHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
};

const isConfirmedActivation = (
  value: SendResponse | null,
): value is SendResponse & {
  ok: true;
  status: 'OUT_FOR_SIGNATURE';
  distribution: NonNullable<SendResponse['distribution']>;
  signingUrlVerified: boolean;
} =>
  value !== null &&
  value.error === undefined &&
  value.ok === true &&
  value.status === 'OUT_FOR_SIGNATURE' &&
  Array.isArray(value.distribution) &&
  value.distribution.every(
    (leg) =>
      (leg.channel === 'whatsapp' ||
        leg.channel === 'email' ||
        leg.channel === 'copy-link') &&
      typeof leg.ok === 'boolean',
  ) &&
  (value.primaryChannel === 'whatsapp' ||
    value.primaryChannel === 'email' ||
    value.primaryChannel === 'copy-link') &&
  typeof value.signingUrlVerified === 'boolean' &&
  (value.counterpartySigningUrl === null ||
    value.counterpartySigningUrl === undefined ||
    typeof value.counterpartySigningUrl === 'string');

const ACTIVATION_RECONCILED_MESSAGE =
  'Document activation is confirmed. Recipient delivery is still separate; review the agreement before contacting the other broker.';
const SEND_UNKNOWN_MESSAGE =
  'The send result is unknown. Check document status before leaving or taking another action.';
const SEND_PENDING_MESSAGE =
  'The send request is still pending. Wait or check document status; another send is blocked.';
const FINALIZATION_UNKNOWN_MESSAGE =
  'The brokerage-signature result is not confirmed. This document is preserved; check its status and review it before continuing.';

const idToString = (v: unknown): string =>
  typeof v === 'number' || typeof v === 'string' ? String(v) : '';

const isOptionalString = (value: unknown): boolean =>
  value === undefined || value === null || typeof value === 'string';

const isValidDealStateResponse = (
  value: unknown,
): value is DealStateResponse & {
  agreement: NonNullable<DealStateResponse['agreement']> | null;
} => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const response = value as DealStateResponse;
  if (response.error !== undefined) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'agreement')) return false;
  if (
    response.prefill !== undefined &&
    (typeof response.prefill !== 'object' ||
      response.prefill === null ||
      Array.isArray(response.prefill))
  ) {
    return false;
  }
  if (response.agreement === null) return true;
  const agreement = response.agreement;
  return (
    typeof agreement === 'object' &&
    agreement !== null &&
    typeof agreement.a2aDocumentId === 'string' &&
    agreement.a2aDocumentId.trim() !== '' &&
    isOptionalString(agreement.documensoDocumentId) &&
    isOptionalString(agreement.status) &&
    isOptionalString(agreement.counterpartySigningUrl) &&
    isOptionalString(agreement.signedPdfUrl) &&
    isOptionalString(agreement.auditUrl) &&
    isOptionalString(agreement.createdAt)
  );
};

export const useA2AStudio = (
  opportunityId: string | null,
  variant: A2AVariant,
  seedPrefill: A2APrefill,
  memberId: string | null = null,
): A2AStudioState => {
  const scopeKey = scopeKeyFor(memberId, opportunityId, variant);
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
  const [dispatchState, setDispatchState] = useState<A2ADispatchState>('never');
  const [finalizationState, setFinalizationState] =
    useState<A2AFinalizationState>('none');
  const [lookupState, setLookupState] = useState<A2ALookupState>('pending');

  // A single stable mutable holder for the values the stable callbacks + the
  // unmount cleanup need to read at call-time (the live draft + whether we've
  // sent). Lazily initialized via useState so the object identity is stable
  // across renders without `useRef` (Twenty's no-state-useref rule reserves
  // useRef for DOM element refs only). We keep it in sync each render.
  const [live] = useState<{
    draft: A2ADraft | null;
    sent: boolean;
    scopeKey: string | null;
    generation: number;
    mounted: boolean;
    creating: boolean;
    finalizing: boolean;
    status: A2ADocumentStatus | null;
    latestStatusRequest: number;
    lookupConfirmedScope: string | null;
  }>(() => ({
    draft: null,
    sent: false,
    scopeKey,
    generation: 0,
    mounted: true,
    creating: false,
    finalizing: false,
    status: null,
    latestStatusRequest: 0,
    lookupConfirmedScope: null,
  }));
  if (live.scopeKey !== scopeKey) {
    // Invalidate outstanding work during render, before an effect from the new
    // scope can run. This closes the window where an old promise could settle
    // between navigation render and effect cleanup.
    live.scopeKey = scopeKey;
    live.generation += 1;
    live.draft = null;
    live.sent = false;
    live.creating = false;
    live.finalizing = false;
    live.status = null;
    live.latestStatusRequest = 0;
    live.lookupConfirmedScope = null;
  } else {
    live.draft = draft;
    live.status = status;
  }

  const isCurrent = useCallback(
    (
      expectedScope: string | null,
      expectedGeneration: number,
      expectedDocumentId?: string,
    ) =>
      live.mounted &&
      live.scopeKey === expectedScope &&
      live.generation === expectedGeneration &&
      (expectedDocumentId === undefined ||
        live.draft?.a2aDocumentId === expectedDocumentId),
    [live],
  );

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
    if (scopeKey === null || lookupState !== 'clear') {
      setErrorMessage(
        lookupState === 'unavailable'
          ? 'We could not check this deal for an existing agreement. Try the status check before creating one.'
          : 'Wait until the existing agreement check finishes before creating a draft.',
      );
      return;
    }
    if (
      live.lookupConfirmedScope !== scopeKey ||
      live.creating ||
      live.finalizing ||
      finalizationGuards.has(scopeKey)
    ) {
      return;
    }
    live.generation += 1;
    const expectedGeneration = live.generation;
    const expectedScope = scopeKey;
    let dispatchedFinalization: A2ADraft | null = null;
    live.creating = true;
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
      if (!isCurrent(expectedScope, expectedGeneration)) return;
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
      live.draft = next;
      live.status = 'DRAFT';
      setDispatchState('never');
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
        finalizationGuards.set(expectedScope, {
          draft: next,
          state: 'pending',
        });
        dispatchedFinalization = next;
        setFinalizationState('pending');
        live.finalizing = true;
        setFinalizing(true);
        const fin = await callPropelRoute<FinalizeResponse>('/a2a/finalize', {
          a2aDocumentId: next.a2aDocumentId,
          documensoDocumentId: next.documensoDocumentId,
          isRera: false,
        });
        if (!isCurrent(expectedScope, expectedGeneration, next.a2aDocumentId)) {
          return;
        }
        if (finalizationGuardFor(expectedScope, next) === undefined) return;
        live.finalizing = false;
        setFinalizing(false);
        if (fin === null || fin.error !== undefined) {
          if (fin?.attempted === false && fin.uncertain !== true) {
            finalizationGuards.delete(expectedScope);
            setFinalizationState('none');
          } else {
            finalizationGuards.set(expectedScope, {
              draft: next,
              state: 'unknown',
            });
            setFinalizationState('unknown');
          }
          setStep('error');
          setErrorMessage(
            fin?.attempted === false && fin.uncertain !== true
              ? (fin.error ?? 'Could not apply your brokerage signature.')
              : (fin?.error ?? FINALIZATION_UNKNOWN_MESSAGE),
          );
          return;
        }
        if (fin.baked === false && fin.reason === 'signs-in-embed') {
          finalizationGuards.delete(expectedScope);
          setFinalizationState('none');
          if (next.ourRecipientToken === null) {
            setStep('error');
            setErrorMessage(
              'The signing session is missing — the draft was created but cannot be signed here.',
            );
            return;
          }
          setStep('signEmbed');
          return;
        }
        if (fin.baked !== true) {
          finalizationGuards.set(expectedScope, {
            draft: next,
            state: 'unknown',
          });
          setFinalizationState('unknown');
          setStep('error');
          setErrorMessage(FINALIZATION_UNKNOWN_MESSAGE);
          return;
        }
        finalizationGuards.delete(expectedScope);
        setFinalizationState('none');
        setStep('send');
      }
    } catch {
      if (!isCurrent(expectedScope, expectedGeneration)) return;
      if (dispatchedFinalization !== null) {
        if (
          finalizationGuardFor(expectedScope, dispatchedFinalization) ===
          undefined
        ) {
          return;
        }
        finalizationGuards.set(expectedScope, {
          draft: dispatchedFinalization,
          state: 'unknown',
        });
        setFinalizationState('unknown');
      }
      setStep('error');
      setErrorMessage(
        dispatchedFinalization === null
          ? 'Could not create the draft.'
          : FINALIZATION_UNKNOWN_MESSAGE,
      );
    } finally {
      if (isCurrent(expectedScope, expectedGeneration)) {
        live.creating = false;
        live.finalizing = false;
        setCreating(false);
        setFinalizing(false);
      }
    }
  }, [
    opportunityId,
    scopeKey,
    lookupState,
    variant,
    prefill,
    counterparty,
    isCurrent,
    live,
  ]);

  const onEmbedCompleted = useCallback(() => {
    // Our recipient finished signing in the embed → move to send.
    setStep('send');
  }, []);

  const refreshStatus = useCallback(async () => {
    const d = live.draft;
    if (d === null) return;
    const expectedScope = live.scopeKey;
    const expectedGeneration = live.generation;
    const request = live.latestStatusRequest + 1;
    live.latestStatusRequest = request;
    const res = await callPropelRoute<StatusResponse>('/a2a/status', {
      a2aDocumentId: d.a2aDocumentId,
    });
    if (
      !isCurrent(expectedScope, expectedGeneration, d.a2aDocumentId) ||
      request !== live.latestStatusRequest
    ) {
      return;
    }
    if (res === null || res.error !== undefined) return;
    if (res.status !== undefined) {
      live.status = res.status;
      setStatus(res.status);
    }
    const guardedFinalization = finalizationGuardFor(expectedScope, d);
    if (res.signedPdfUrl !== undefined) setSignedPdfUrl(res.signedPdfUrl);
    if (res.auditUrl !== undefined) setAuditUrl(res.auditUrl);
    if (res.status === 'OUT_FOR_SIGNATURE' || res.status === 'SIGNED') {
      if (expectedScope !== null) {
        attemptGuards.set(expectedScope, { draft: d, state: 'activated' });
      }
      live.sent = true;
      setDispatchState('activated');
      if (guardedFinalization === undefined) {
        setSendMessage(ACTIVATION_RECONCILED_MESSAGE);
        setErrorMessage(null);
      } else {
        setSendMessage(null);
        setErrorMessage(FINALIZATION_UNKNOWN_MESSAGE);
      }
      if (isPublicHttpUrl(res.counterpartySigningUrl)) {
        setShareUrl(res.counterpartySigningUrl);
      }
    }
    // Send/activation status is useful evidence for dispatch, but it is not a
    // receipt for the earlier finalize mutation. Keep that uncertainty visible.
    if (res.status === 'SIGNED' && guardedFinalization === undefined) {
      setStep('done');
    }
  }, [isCurrent, live]);

  const send = useCallback(
    async (channels: SendChannel[]): Promise<SendResult> => {
      const d = live.draft;
      if (d === null) {
        return { ok: false, message: 'There is no draft to send yet.' };
      }
      const expectedScope = live.scopeKey;
      const expectedGeneration = live.generation;
      if (expectedScope === null) {
        return {
          ok: false,
          message:
            'Your signed-in workspace identity is unavailable. No send was attempted.',
        };
      }
      if (finalizationGuardFor(expectedScope, d) !== undefined) {
        setErrorMessage(FINALIZATION_UNKNOWN_MESSAGE);
        return { ok: false, message: FINALIZATION_UNKNOWN_MESSAGE };
      }
      const guarded = attemptGuards.get(expectedScope);
      if (
        guarded !== undefined &&
        guarded.draft.a2aDocumentId === d.a2aDocumentId
      ) {
        const message =
          guarded.state === 'pending'
            ? SEND_PENDING_MESSAGE
            : guarded.state === 'unknown'
              ? SEND_UNKNOWN_MESSAGE
              : ACTIVATION_RECONCILED_MESSAGE;
        setSendMessage(message);
        return { ok: false, message };
      }

      // Install the page-lifetime write guard before yielding to the route. A
      // second click in this same tick therefore cannot dispatch again.
      attemptGuards.set(expectedScope, { draft: d, state: 'pending' });
      setDispatchState('pending');
      setSendMessage(SEND_PENDING_MESSAGE);
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
        if (!isCurrent(expectedScope, expectedGeneration, d.a2aDocumentId))
          return { ok: false, message: SEND_UNKNOWN_MESSAGE };
        if (!isConfirmedActivation(res)) {
          const latestGuard = attemptGuards.get(expectedScope);
          if (
            latestGuard?.draft.a2aDocumentId === d.a2aDocumentId &&
            latestGuard.state === 'activated'
          ) {
            return { ok: true, message: ACTIVATION_RECONCILED_MESSAGE };
          }
          if (res?.attempted === false) {
            attemptGuards.delete(expectedScope);
            setDispatchState('never');
            const message = res.error ?? 'The send was not attempted.';
            setErrorMessage(message);
            setSendMessage(message);
            return { ok: false, message };
          }
          attemptGuards.set(expectedScope, { draft: d, state: 'unknown' });
          setDispatchState('unknown');
          setSendMessage(SEND_UNKNOWN_MESSAGE);
          setErrorMessage(SEND_UNKNOWN_MESSAGE);
          return { ok: false, message: SEND_UNKNOWN_MESSAGE };
        }
        if (res.error !== undefined) {
          const message = res.error;
          setErrorMessage(message);
          return { ok: false, message };
        }
        // The envelope is activated and the CRM row is OUT_FOR_SIGNATURE. What
        // reached the counterparty is a separate question — answered by the
        // service's per-leg report, never by `ok`.
        live.sent = true;
        attemptGuards.set(expectedScope, { draft: d, state: 'activated' });
        setDispatchState('activated');
        if (live.status !== 'SIGNED') {
          live.status = 'OUT_FOR_SIGNATURE';
          setStatus('OUT_FOR_SIGNATURE');
        }
        // The ONLY link we will ever hand the agent: the one this send resolved
        // off the live document. If the service could not resolve one, we hold
        // nothing rather than offering the dead pre-bake link (task 49).
        const returnedUrl = isPublicHttpUrl(res.counterpartySigningUrl)
          ? res.counterpartySigningUrl
          : null;
        if (returnedUrl !== null) setShareUrl(returnedUrl);
        const outcome = summariseDistribution(res.distribution);
        const finalOutcome: SendOutcome = {
          ...outcome,
          linkReady: outcome.linkReady || returnedUrl !== null,
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
        if (isCurrent(expectedScope, expectedGeneration, d.a2aDocumentId))
          setSending(false);
      }
    },
    [counterparty, isCurrent, live],
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
    const d = live.draft;
    const guardedFinalization = finalizationGuardFor(live.scopeKey, d);
    if (d !== null && guardedFinalization !== undefined) {
      setDraft(d);
      setFinalizationState(guardedFinalization.state);
      setSendMessage(null);
      setErrorMessage(FINALIZATION_UNKNOWN_MESSAGE);
      setStep('error');
      return;
    }
    const guarded =
      live.scopeKey === null ? undefined : attemptGuards.get(live.scopeKey);
    if (
      d !== null &&
      guarded !== undefined &&
      guarded.draft.a2aDocumentId === d.a2aDocumentId
    ) {
      const message =
        guarded.state === 'pending'
          ? SEND_PENDING_MESSAGE
          : guarded.state === 'unknown'
            ? SEND_UNKNOWN_MESSAGE
            : ACTIVATION_RECONCILED_MESSAGE;
      setSendMessage(message);
      setErrorMessage(message);
      setStep('send');
      return;
    }
    live.sent = false;
    live.draft = null;
    live.status = null;
    live.creating = false;
    live.finalizing = false;
    live.generation += 1;
    setFinalizationState('none');
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
    setCreating(false);
    setFinalizing(false);
    setSending(false);
    setFinalizationState('none');
  }, [live]);

  // ── What this deal already has (task 52) ──────────────────────────────────
  // Proven on prod: reopening the Studio on a deal whose agreement was already
  // out for signature showed the blank prepare form and a "Create draft" button.
  // One read at mount answers it. An agreement that is already out for signature
  // or signed is RESUMED; an older unfinished draft is only reported, because its
  // Documenso draft may be long gone and silently continuing it would be a guess.
  useEffect(() => {
    live.mounted = true;
    live.draft = null;
    live.sent = false;
    live.status = null;
    live.creating = false;
    live.finalizing = false;
    live.lookupConfirmedScope = null;
    setDraft(null);
    setStatus(null);
    setStep('prepare');
    setDispatchState('never');
    setExistingDraftNotice(null);
    setErrorMessage(null);
    setSendMessage(null);
    setShareUrl(null);
    setCreating(false);
    setFinalizing(false);
    setSending(false);
    setFinalizationState('none');
    if (opportunityId === null || opportunityId === '' || scopeKey === null) {
      setLookupState('unavailable');
      setResuming(false);
      return;
    }
    let cancelled = false;
    setLookupState('pending');
    setResuming(true);
    void (async () => {
      const res = await callPropelRoute<DealStateResponse>('/a2a/deal-state', {
        opportunityId,
        variant,
      });
      if (cancelled || live.scopeKey !== scopeKey) return;
      const guarded = attemptGuards.get(scopeKey);
      const validResponse = isValidDealStateResponse(res);
      const guardedFinalization = finalizationGuards.get(scopeKey);
      const shouldRestoreFinalization =
        guardedFinalization !== undefined &&
        (!validResponse ||
          res.agreement === null ||
          res.agreement.a2aDocumentId ===
            guardedFinalization.draft.a2aDocumentId);
      if (shouldRestoreFinalization) {
        if (validResponse && res.prefill !== undefined) {
          setPrefillState((cur) => ({ ...res.prefill, ...cur }));
        }
        const preservedDraft = guardedFinalization.draft;
        const preservedAgreement = validResponse ? res.agreement : null;
        const preservedStatus = preservedAgreement?.status ?? 'DRAFT';
        setDraft(preservedDraft);
        live.draft = preservedDraft;
        setStatus(preservedStatus);
        live.status = preservedStatus;
        setSignedPdfUrl(preservedAgreement?.signedPdfUrl ?? null);
        setAuditUrl(preservedAgreement?.auditUrl ?? null);
        if (isPublicHttpUrl(preservedAgreement?.counterpartySigningUrl)) {
          setShareUrl(preservedAgreement.counterpartySigningUrl);
        }
        const matchingSendGuard =
          guarded !== undefined && isSameDraft(guarded.draft, preservedDraft)
            ? guarded
            : undefined;
        if (
          preservedStatus === 'OUT_FOR_SIGNATURE' ||
          preservedStatus === 'SIGNED'
        ) {
          attemptGuards.set(scopeKey, {
            draft: preservedDraft,
            state: 'activated',
          });
          live.sent = true;
          setDispatchState('activated');
          setSendMessage(ACTIVATION_RECONCILED_MESSAGE);
        } else if (matchingSendGuard !== undefined) {
          live.sent = matchingSendGuard.state === 'activated';
          setDispatchState(matchingSendGuard.state);
          setSendMessage(
            matchingSendGuard.state === 'pending'
              ? SEND_PENDING_MESSAGE
              : matchingSendGuard.state === 'unknown'
                ? SEND_UNKNOWN_MESSAGE
                : ACTIVATION_RECONCILED_MESSAGE,
          );
        } else {
          live.sent = false;
          setDispatchState('never');
        }
        setFinalizationState(guardedFinalization.state);
        setLookupState('blocked');
        setStep('error');
        setSendMessage(null);
        setErrorMessage(FINALIZATION_UNKNOWN_MESSAGE);
        setResuming(false);
        return;
      }
      if (validResponse) {
        live.lookupConfirmedScope = scopeKey;
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
          attemptGuards.set(scopeKey, { draft: resumed, state: 'activated' });
          setDispatchState('activated');
          setLookupState('blocked');
          setStatus(plan.status);
          live.status = plan.status;
          setShareUrl(plan.shareUrl);
          setSignedPdfUrl(plan.signedPdfUrl);
          setAuditUrl(plan.auditUrl);
          setStep(plan.step);
        } else if (plan.kind === 'notice') {
          if (guarded !== undefined) {
            setDraft(guarded.draft);
            live.draft = guarded.draft;
            setStatus(res.agreement?.status === 'DRAFT' ? 'DRAFT' : null);
            live.status = res.agreement?.status === 'DRAFT' ? 'DRAFT' : null;
            setDispatchState(guarded.state);
            setStep('send');
            setSendMessage(
              guarded.state === 'pending'
                ? SEND_PENDING_MESSAGE
                : SEND_UNKNOWN_MESSAGE,
            );
          } else {
            setExistingDraftNotice({
              status: plan.status,
              createdAt: plan.createdAt,
            });
          }
          setLookupState('blocked');
        } else if (guarded !== undefined) {
          setDraft(guarded.draft);
          live.draft = guarded.draft;
          setDispatchState(guarded.state);
          setStep('send');
          setSendMessage(
            guarded.state === 'pending'
              ? SEND_PENDING_MESSAGE
              : guarded.state === 'unknown'
                ? SEND_UNKNOWN_MESSAGE
                : ACTIVATION_RECONCILED_MESSAGE,
          );
          setLookupState('blocked');
        } else {
          setLookupState('clear');
        }
      } else if (guarded !== undefined) {
        live.lookupConfirmedScope = null;
        setDraft(guarded.draft);
        live.draft = guarded.draft;
        setDispatchState(guarded.state);
        setStep('send');
        setSendMessage(
          guarded.state === 'pending'
            ? SEND_PENDING_MESSAGE
            : SEND_UNKNOWN_MESSAGE,
        );
        setLookupState('blocked');
      } else {
        live.lookupConfirmedScope = null;
        setLookupState('unavailable');
      }
      setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
    // Reads once per deal/variant; the form owns everything after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, opportunityId, scopeKey, variant]);

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
    live.mounted = true;
    return () => {
      const d = live.draft;
      const guarded =
        live.scopeKey === null ? undefined : attemptGuards.get(live.scopeKey);
      const guardedFinalization = finalizationGuardFor(live.scopeKey, d);
      if (
        d !== null &&
        !live.sent &&
        !live.creating &&
        !live.finalizing &&
        guardedFinalization === undefined &&
        (guarded === undefined ||
          guarded.draft.a2aDocumentId !== d.a2aDocumentId)
      ) {
        const body: DiscardRequest = {
          a2aDocumentId: d.a2aDocumentId,
          ...(d.documensoDocumentId !== ''
            ? { documensoDocumentId: d.documensoDocumentId }
            : {}),
        };
        void callPropelRoute<DiscardResponse>('/a2a/discard', body);
      }
      live.mounted = false;
      live.generation += 1;
      live.draft = null;
      live.status = null;
      live.creating = false;
      live.finalizing = false;
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
    dispatchState,
    finalizationState,
    lookupState,
    canCreateDraft:
      lookupState === 'clear' &&
      scopeKey !== null &&
      live.lookupConfirmedScope === scopeKey &&
      draft === null &&
      !creating &&
      finalizationState === 'none',
    canSend:
      draft !== null &&
      dispatchState === 'never' &&
      finalizationState === 'none' &&
      !sending,
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
