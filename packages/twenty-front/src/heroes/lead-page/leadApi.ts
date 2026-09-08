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
// My Desk's stage move enforces the stage gates and creates the stage task.
export const moveStage = (host: PropelHeroHost, deskLane: string, recordId: string, toStage: string) =>
  host.callPropelRoute<{ ok: boolean; error?: string; reason?: string; previousStage?: string }>('/my-desk', { action: 'moveStage', laneObject: deskLane, recordId, toStage });
export const createDeal = (host: PropelHeroHost, laneKey: 'offplan' | 'secondary' | 'sell' | 'rcbi' | 'institutional', contactId: string, name: string) =>
  host.callPropelRoute<{ ok?: boolean; opportunityId?: string; error?: string }>('/lead/create-opportunity', { lane: laneKey, contactId, name });
export const movePipeline = (host: PropelHeroHost, sourceLane: string, destinationLane: string, dealId: string) =>
  host.callPropelRoute<{ error?: string; moved?: number }>('/opportunities/move', { sourceLane, destinationLane, sourceIds: [dealId] });
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
