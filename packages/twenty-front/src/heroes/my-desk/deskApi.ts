// deskApi.ts — typed wrappers for POST /my-desk (the paged My Desk aggregate).
//
// callPropelRoute<T>(path, body) (see @/propel/lib/callPropelRoute.ts) posts a
// FLAT body — `event.body` on the route is the parsed JSON AS-IS, never a
// `{ body: {...} }` wrapper — and resolves the parsed JSON on any 2xx response,
// or `null` on a transport failure / missing auth token. It never throws.
//
// fetchBoard is the one wrapper that turns a failure into a thrown Error: the
// board is a single paged sequence, so a mid-page failure has to stop the loop
// and let the board panel render its own failure line (never a blank desk with
// no explanation). fetchRail / fetchWaContext / fetchTimeline stay `T | null` —
// each caller renders its own per-panel empty/error state from that.

import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import type {
  DeskBoardResponse,
  DeskCallNoteResponse,
  DeskGateStatusResponse,
  DeskNextActionResponse,
  DeskRailResponse,
  DeskRow,
  DeskTimelineResponse,
  DeskWaContextResponse,
  DeskWaDraftResponse,
  DeskWriteResponse,
  ReidinPollResponse,
  ReidinStartResponse,
} from './types';

const ROUTE = '/my-desk';
const ASSIST = '/my-desk/assist';

// Paging safety rails: the loop must terminate even against a misbehaving
// server. A non-advancing nextCursor (the same value echoed back) would
// otherwise spin forever; MAX_BOARD_PAGES caps a runaway-but-advancing
// sequence (40 pages × 50 rows = a 2,000-row desk — far past any real
// personal book).
const MAX_BOARD_PAGES = 40;

/** Small per-session facts the board response carries alongside the rows
 *  (Batch 3): the acting agent's first name (greeting) + member id (persistence
 *  key). Delivered once, from the FIRST board page. */
export type DeskBoardMeta = { actingMemberName: string | null; memberId: string | null };

/**
 * Pages through the board (route caps each page at 50 rows / 25 per lane — the
 * 64KB IPC ceiling gotcha — so a real book needs several round-trips). `onPage`
 * is called with the growing accumulator after every page lands, so the caller
 * can paint rows as they arrive instead of showing a blank desk until the last
 * page resolves. `onMeta` (optional) fires once, on the first page, with the
 * acting member's first name + id. Throws on any failure — including a
 * stuck/runaway cursor — AFTER the pages that did land were already delivered
 * via `onPage`, so the caller can keep the partial board on screen and flag the gap.
 */
export const fetchBoard = async (
  onPage: (rows: DeskRow[]) => void,
  onMeta?: (meta: DeskBoardMeta) => void,
): Promise<DeskRow[]> => {
  const all: DeskRow[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: DeskBoardResponse | null = await callPropelRoute<DeskBoardResponse>(ROUTE, {
      action: 'board',
      ...(cursor ? { cursor } : {}),
    });
    if (page === null) {
      throw new Error('DESK_LOAD_FAILED');
    }
    if (!page.ok) {
      throw new Error(page.error || 'DESK_LOAD_FAILED');
    }
    all.push(...page.rows);
    if (pages === 0 && onMeta) {
      onMeta({ actingMemberName: page.actingMemberName ?? null, memberId: page.memberId ?? null });
    }
    onPage(all); // stream pages into the table — no blank desk while later pages load
    pages += 1;
    const previousCursor: string | null = cursor;
    cursor = page.nextCursor;
    if (cursor !== null && cursor === previousCursor) {
      // Server echoed the cursor back unchanged — bail instead of looping forever.
      throw new Error('DESK_PAGING_STUCK');
    }
    if (cursor !== null && pages >= MAX_BOARD_PAGES) {
      throw new Error('DESK_PAGING_OVERFLOW');
    }
  } while (cursor);
  return all;
};

/** Tasks/viewings/unread-WA/priority-leads for the right rail — one call, ≤10 each. */
export const fetchRail = (): Promise<DeskRailResponse | null> =>
  callPropelRoute<DeskRailResponse>(ROUTE, { action: 'rail' });

/** WhatsApp 24h session-window state + the approved-template pool for one person. */
export const fetchWaContext = (
  personId: string,
): Promise<DeskWaContextResponse | null> =>
  callPropelRoute<DeskWaContextResponse>(ROUTE, {
    action: 'waContext',
    personId,
  });

/** The peek-drawer timeline for one lane record (notes/tasks/calls/WhatsApp, merged). */
export const fetchTimeline = (
  laneObject: string,
  recordId: string,
  cursor?: string,
): Promise<DeskTimelineResponse | null> =>
  callPropelRoute<DeskTimelineResponse>(ROUTE, {
    action: 'timeline',
    laneObject,
    recordId,
    ...(cursor ? { cursor } : {}),
  });

export const runDeskAction = (
  action: string,
  body: Record<string, unknown>,
): Promise<DeskWriteResponse | null> =>
  callPropelRoute<DeskWriteResponse>(ROUTE, { action, ...body });

export const fetchStageGateStatus = (
  laneObject: string,
  recordId: string,
  toStage: string,
): Promise<DeskGateStatusResponse | null> =>
  callPropelRoute<DeskGateStatusResponse>(ROUTE, {
    action: 'gateStatus',
    laneObject,
    recordId,
    toStage,
  });

// ── REIDIN login helper (Batch 3 rail panel) ─────────────────────────────────
// The SAME gated start/poll routes the standalone REIDIN page used. callPropelRoute
// posts a flat body under `${base}/s<path>` (so '/reidin/otp/start' → /s/reidin/otp/start)
// and returns the parsed JSON (both the ok + the IN_USE/error shapes) or null on a
// transport failure. Not role-restricted — any signed-in agent (same access the
// standalone had).
export const startReidinOtp = (): Promise<ReidinStartResponse | null> =>
  callPropelRoute<ReidinStartResponse>('/reidin/otp/start', {});

export const pollReidinOtp = (sessionId: string): Promise<ReidinPollResponse | null> =>
  callPropelRoute<ReidinPollResponse>('/reidin/otp/poll', { sessionId });

// ── AI assist wrappers (My Desk AI v1) ───────────────────────────────────────
// All three post a FLAT body to /my-desk/assist and return the parsed JSON (the
// ok draft/suggestion OR the honest {ok:false,code} degrade envelope) — or null
// on a transport failure. Every caller treats null / non-ok as "no draft" and
// keeps the manual flow fully working; the AI is additive, never a gate.

/** A pre-drafted WhatsApp reply grounded in the deal + last inbound message. */
export const assistWaDraft = (
  laneObject: string,
  recordId: string,
  contactId?: string,
): Promise<DeskWaDraftResponse | null> =>
  callPropelRoute<DeskWaDraftResponse>(ASSIST, {
    action: 'waDraft',
    laneObject,
    recordId,
    ...(contactId ? { contactId } : {}),
  });

/** A proposed next action (+ a one-click task title) built from the timeline. */
export const assistNextAction = (
  laneObject: string,
  recordId: string,
): Promise<DeskNextActionResponse | null> =>
  callPropelRoute<DeskNextActionResponse>(ASSIST, {
    action: 'nextAction',
    laneObject,
    recordId,
  });

/** A factual post-call note draft (falls back to the contact's most recent call
 *  when no callId is given — the call that just ended). */
export const assistCallNote = (
  laneObject: string,
  recordId: string,
  callId?: string,
): Promise<DeskCallNoteResponse | null> =>
  callPropelRoute<DeskCallNoteResponse>(ASSIST, {
    action: 'callNote',
    laneObject,
    recordId,
    ...(callId ? { callId } : {}),
  });

export const sendDeskWhatsApp = (
  conversationId: string,
  body: string,
  templateName?: string,
): Promise<Record<string, unknown> | null> =>
  callPropelRoute<Record<string, unknown>>('/marketing/inbox-reply', {
    id: conversationId,
    channel: 'WHATSAPP',
    body,
    ...(templateName ? { templateName } : {}),
  });
