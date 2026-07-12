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
  DeskGateStatusResponse,
  DeskRailResponse,
  DeskRow,
  DeskTimelineResponse,
  DeskWaContextResponse,
  DeskWriteResponse,
} from './types';

const ROUTE = '/my-desk';

// Paging safety rails: the loop must terminate even against a misbehaving
// server. A non-advancing nextCursor (the same value echoed back) would
// otherwise spin forever; MAX_BOARD_PAGES caps a runaway-but-advancing
// sequence (40 pages × 50 rows = a 2,000-row desk — far past any real
// personal book).
const MAX_BOARD_PAGES = 40;

/**
 * Pages through the board (route caps each page at 50 rows / 25 per lane — the
 * 64KB IPC ceiling gotcha — so a real book needs several round-trips). `onPage`
 * is called with the growing accumulator after every page lands, so the caller
 * can paint rows as they arrive instead of showing a blank desk until the last
 * page resolves. Throws on any failure — including a stuck/runaway cursor —
 * AFTER the pages that did land were already delivered via `onPage`, so the
 * caller can keep the partial board on screen and flag the gap.
 */
export const fetchBoard = async (
  onPage: (rows: DeskRow[]) => void,
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
