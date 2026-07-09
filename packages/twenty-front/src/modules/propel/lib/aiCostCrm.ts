import { callPropelRoute } from '@/propel/lib/callPropelRoute';
import { type AnalyticsRange } from '@/propel/types/marketingHome';

// Data layer for the AI-cost ledger — the "What it cost" block on the Night Desk.
// ONE Manager/Admin-gated CRM route reports the whole AI spend (LLM + image gen)
// across the marketing benches (propel-crm-integration):
//
//   POST /s/marketing/ai-cost  body { action, ... }   (FLAT body — the gotcha)
//     action:'costSummary' + { range:'7d'|'30d'|'90d' }
//       → { ok, totalUsd, totalAed,
//           byFeature:{ bench, spine, style, media, … },   (per-lane USD)
//           byKind:{ LLM, IMAGE },                          (per-kind USD)
//           eventCount }
//       → 0s / empty maps until benches run — a legitimate REAL value, not a gap.
//       → { ok:false, code:'FEATURE_OFF' }                 (ledger not enabled)
//       → { ok:false, error:'unknown action …' }           (route predates the action)
//
// callPropelRoute sends the CRM session token; identity + role are derived
// server-side and the route fails CLOSED for a non-Manager. It returns the parsed
// 2xx body, or null (non-2xx / network / not signed in / route not deployed). A
// gated/bad-input envelope answers 200 with { ok:false, code }, so we narrow on
// body shape and hand the caller a discriminated result — never a fake number.
//
// Graceful degrade: `unavailable` = the ledger isn't live on this workspace (route
// missing → null body, FEATURE_OFF, or an older route answering "unknown action").
// The caller renders the cost lines as "—" instead of a fabricated figure. NOTE a
// genuine zero (totalAed:0, empty maps) is NOT unavailable — it renders "AED 0".

const ROUTE = '/marketing/ai-cost';

type Envelope = { ok?: boolean; error?: string; code?: string } & Record<
  string,
  unknown
>;

export type AiCostRange = AnalyticsRange;

export interface AiCostSummary {
  totalUsd: number;
  totalAed: number;
  // Per-lane / per-kind USD breakdowns — tolerant: any string→number pairs the
  // route reports (bench/spine/style/media/…), never a fixed enum, so a new lane
  // shows up without a client change.
  byFeature: Record<string, number>;
  byKind: Record<string, number>;
  eventCount: number;
}

export type GetAiCostResult =
  | { ok: true; summary: AiCostSummary }
  | { ok: false; error: string; unavailable: boolean };

const failMessage = (body: Envelope | null): string => {
  if (body === null) {
    return 'Could not reach the AI-cost ledger (sign in as a Manager; the feature may not be deployed yet).';
  }
  return typeof body.error === 'string' && body.error
    ? body.error
    : 'Request failed.';
};

// Route missing (null), FEATURE_OFF, or a pre-ledger route answering "unknown
// action" — all mean "the ledger isn't live here", so the cost lines fall to "—".
const isUnavailable = (body: Envelope | null): boolean => {
  if (body === null) return true;
  if (body.ok === false && body.code === 'FEATURE_OFF') return true;
  return (
    typeof body.error === 'string' &&
    body.error.toLowerCase().includes('unknown action')
  );
};

const asNum = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

// Project an { key: number } map, dropping any non-numeric entries rather than
// coercing them — a malformed lane never poisons the total.
const asNumMap = (v: unknown): Record<string, number> => {
  if (v === null || typeof v !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[key] = val;
  }
  return out;
};

/**
 * getAiCostSummary — the "What it cost" read. `range` is the same 7d/30d/90d
 * window the desk's segmented control drives. A route that predates the action,
 * a non-Manager, or an un-deployed ledger answers `unavailable:true` and the cost
 * lines render "—"; a live-but-idle ledger answers real zeros → "AED 0".
 */
export async function getAiCostSummary(
  range: AiCostRange,
): Promise<GetAiCostResult> {
  const body = await callPropelRoute<Envelope>(ROUTE, {
    action: 'costSummary',
    range,
  });
  if (body && body.ok === true) {
    return {
      ok: true,
      summary: {
        totalUsd: asNum(body.totalUsd),
        totalAed: asNum(body.totalAed),
        byFeature: asNumMap(body.byFeature),
        byKind: asNumMap(body.byKind),
        eventCount: asNum(body.eventCount),
      },
    };
  }
  return {
    ok: false,
    error: failMessage(body),
    unavailable: isUnavailable(body),
  };
}
