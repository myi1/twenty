// leadApi.ts: typed wrappers for POST /lead-page (the one-screen agent lead page),
// plus the handful of existing routes the page reuses (My Desk's stage move, deal
// creation, pipeline move, the call-note assist and the WhatsApp send route).
//
// host.callPropelRoute<T>(path, body) posts a FLAT body and resolves the parsed
// JSON on any 2xx response, or `null` on a transport failure / missing auth token.
// It never throws: every caller here handles the `null` case itself.

import { type PropelHeroHost } from '@/propel/runtime/heroHost';
import type { LeadErr, LeadLoad, SaveOutcomeInput, SaveOutcomeResult } from './types';

const ROUTE = '/lead-page';
export type R<T> = (T & { ok: true }) | LeadErr | null;

export const loadLead = (host: PropelHeroHost, personId: string, timelineCursor?: string | null) =>
  host.callPropelRoute<R<LeadLoad>>(ROUTE, { action: 'load', personId, ...(timelineCursor ? { timelineCursor } : {}) });
export const saveOutcome = (host: PropelHeroHost, input: SaveOutcomeInput) =>
  host.callPropelRoute<R<SaveOutcomeResult>>(ROUTE, { action: 'saveOutcome', ...input });
export const setDealField = (host: PropelHeroHost, dealId: string, lane: string, field: string, value: unknown) =>
  host.callPropelRoute<R<{}>>(ROUTE, { action: 'setDealField', dealId, lane, field, value });
export const setLeadPick = (host: PropelHeroHost, personId: string, field: 'purpose' | 'buyTimeline' | 'moneyComfort', value: string | null) =>
  host.callPropelRoute<R<{}>>(ROUTE, { action: 'setLeadPick', personId, field, value });
export const savePicture = (host: PropelHeroHost, personId: string, picture: Partial<Record<'situation' | 'motivation' | 'want' | 'decision' | 'concern', string>>) =>
  host.callPropelRoute<R<{}>>(ROUTE, { action: 'savePicture', personId, ...picture });
export const addNote = (host: PropelHeroHost, personId: string, text: string) =>
  host.callPropelRoute<R<{ noteId: string }>>(ROUTE, { action: 'addNote', personId, text });
export const createFollowUp = (host: PropelHeroHost, personId: string, kind: 'CALL' | 'WHATSAPP' | 'FOLLOW_UP', title: string, dueAt: string, zone: string) =>
  host.callPropelRoute<R<{ taskId: string }>>(ROUTE, { action: 'createFollowUp', personId, kind, title, dueAt, zone });
export const completeTask = (host: PropelHeroHost, taskId: string) =>
  host.callPropelRoute<R<{}>>(ROUTE, { action: 'completeTask', taskId });
// The route derives the lane from the record itself (it no longer trusts a
// caller-supplied lane); `lane` is still sent because the contract accepts it, but
// it is advisory only.
export const markLost = (host: PropelHeroHost, personId: string, reason: string, dealId?: string, lane?: string) =>
  host.callPropelRoute<R<{}>>(ROUTE, { action: 'markLost', personId, reason, ...(dealId ? { dealId, lane } : {}) });
export const setName = (host: PropelHeroHost, personId: string, firstName: string, lastName: string) =>
  host.callPropelRoute<R<{}>>(ROUTE, { action: 'setName', personId, firstName, lastName });
export const setContactField = (host: PropelHeroHost, personId: string, field: 'email' | 'preferredLanguage', value: string) =>
  host.callPropelRoute<R<{}>>(ROUTE, { action: 'setContactField', personId, field, value });

// Existing routes the page reuses (all server-gated already).
//
// The gate a stage move can be refused for. `label` is the human sentence, `fix`
// says what closes it; a taskId lets a caller jump straight to the blocking task.
// Mirrors DeskGate in my-desk/types.ts (my-desk-route.ts's moveStage answers both
// heroes the same way), trimmed to the fields this page actually reads.
export type StageGate = {
  type: 'field' | 'document' | 'activity' | 'approval';
  severity?: 'block' | 'warn';
  label: string;
  fix: string;
  taskId?: string | null;
  inputKind?: 'boolean' | 'date' | 'number';
  setField?: string;
  setTo?: 'true' | null;
};
// my-desk-route.ts's moveStage action, read verbatim from my-desk-route.ts:1035-1120.
// A refusal never carries a top-level `reason`: on GATE_BLOCKED the human sentence
// lives in `gate.label` (with `gate.fix` alongside it), and every other refusal is
// just `{ ok: false, error }` with no `gate` at all. Do not add a `reason` field
// back here without re-reading that route: it does not exist on the wire.
export type MoveStageResult =
  | { ok: true; previousStage: string; noteId: string | null; touchedAt: string | null; sideEffects: string[]; warnings?: StageGate[]; auditWarning?: true }
  | { ok: false; error: string; gate?: StageGate };
// My Desk's stage move enforces the stage gates and creates the stage task.
export const moveStage = (host: PropelHeroHost, deskLane: string, recordId: string, toStage: string) =>
  host.callPropelRoute<MoveStageResult>('/my-desk', { action: 'moveStage', laneObject: deskLane, recordId, toStage });
// GATE_BLOCKED is the one refusal worth explaining in detail: it is the everyday
// stage-gate refusal (a stage task not yet done, RCBI compliance not cleared, a
// missing precondition), and gate.label/gate.fix are the plain-language reason
// and remedy the route already computed. Never show `error` itself: it is a code
// (GATE_BLOCKED, INVALID_INPUT, WRITE_FAILED, ...), not a sentence.
export const moveStageErrorText = (r: MoveStageResult | null): string => {
  if (r && !r.ok && r.error === 'GATE_BLOCKED' && r.gate) return `${r.gate.label} ${r.gate.fix}`.trim();
  return 'The stage did not move. Try again.';
};
export const createDeal = (host: PropelHeroHost, laneKey: 'offplan' | 'secondary' | 'sell' | 'rcbi' | 'institutional', contactId: string, name: string) =>
  host.callPropelRoute<{ ok?: boolean; opportunityId?: string; error?: string }>('/lead/create-opportunity', { lane: laneKey, contactId, name });
// move-opportunity-route.ts:56-63: a move that touched nothing still answers
// `ok: true`. Malformed input (bad lane, no records) is the only case with a
// top-level `error` and no `ok` at all; a per-record failure lands in `failed`
// instead, alongside whichever ids in `moved` DID go through.
export type MovePipelineResult =
  | { ok: true; moved: string[]; failed: Array<{ id: string; reason: string }>; movedCount: number; requested: number; capped?: number; skipped?: number }
  | { error: string };
export const movePipeline = (host: PropelHeroHost, sourceLane: string, destinationLane: string, dealId: string) =>
  host.callPropelRoute<MovePipelineResult>('/opportunities/move', { sourceLane, destinationLane, sourceIds: [dealId] });
export const draftCallNote = (host: PropelHeroHost, personId: string) =>
  host.callPropelRoute<{ ok: true; draft: string; why: string } | { ok: false; code?: string; error?: string }>('/my-desk/assist', { action: 'callNote', laneObject: 'lead', recordId: personId });
export const sendFirstWhatsApp = (host: PropelHeroHost, waPhoneNumber: string, personId: string, body: string) =>
  host.callPropelRoute<{ kind?: 'SENT' | 'QUEUED_FOR_RETRY' | 'REJECTED'; reason?: string; error?: string; conversationId?: string }>('/whatsapp/send', { waPhoneNumber, personId, body });

// Plain words for the toast; never the code.
export const errorText = (r: LeadErr | null | { ok: false; error?: string }): string => {
  const code = r && 'error' in r ? r.error : null;
  if (!r) return 'The CRM did not answer. Check your connection and try again.';
  if (code === 'FORBIDDEN') return 'This lead is not assigned to you.';
  if (code === 'NOT_FOUND') return 'This lead no longer exists.';
  if (code === 'DUPLICATE_REQUEST') return 'Already saved.';
  return 'That did not save. Try again.';
};
