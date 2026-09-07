// scorecardApi.ts — typed wrappers for POST /team-scorecard.
//
// Status-aware on purpose: the hero can be live before the app route is installed on
// an environment (404 → "not on this server yet") or the server can be unreachable
// (0 → "can't reach the server"). Neither may render as a blank page or as zeros.

import { callPropelRouteWithStatus } from '@/propel/lib/callPropelRoute';
import type {
  ScorecardDrillMetric,
  ScorecardErrorPayload,
  ScorecardLeadsPayload,
  ScorecardSummaryPayload,
  ScorecardWindowInput,
} from '@/propel/types/teamScorecard';

const ROUTE = '/team-scorecard';

export type ScorecardLoad<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not-deployed' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

const classify = <T extends { ok: boolean }>(res: { data: T | ScorecardErrorPayload | null; status: number }): ScorecardLoad<T> => {
  if (res.status === 404) return { kind: 'not-deployed' };
  if (res.status === 0) return { kind: 'offline' };
  if (res.status === -1) return { kind: 'error', message: 'You are signed out. Sign in again to see the scorecard.' };
  if (!res.data) return { kind: 'error', message: `The server answered ${res.status} without a result.` };
  if (res.data.ok === false) {
    const err = res.data as ScorecardErrorPayload;
    if (err.error === 'NOT_AVAILABLE') return { kind: 'error', message: 'The scorecard could not tell who you are. Refresh the page or sign in again.' };
    return { kind: 'error', message: err.message ?? 'The scorecard could not be computed.' };
  }
  return { kind: 'ok', data: res.data as T };
};

export const fetchSummary = async (window: ScorecardWindowInput, signal?: AbortSignal): Promise<ScorecardLoad<ScorecardSummaryPayload>> =>
  classify(await callPropelRouteWithStatus<ScorecardSummaryPayload | ScorecardErrorPayload>(ROUTE, { action: 'summary', window }, { signal }));

export const fetchLeads = async (
  window: ScorecardWindowInput,
  metric: ScorecardDrillMetric,
  personId: string | null,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<ScorecardLoad<ScorecardLeadsPayload>> =>
  classify(
    await callPropelRouteWithStatus<ScorecardLeadsPayload | ScorecardErrorPayload>(
      ROUTE,
      { action: 'leads', window, metric, ...(personId ? { personId } : {}), ...(cursor ? { cursor } : {}) },
      { signal },
    ),
  );
