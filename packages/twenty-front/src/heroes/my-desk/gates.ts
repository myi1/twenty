import type { DeskLane } from './types';

// UI mirror of the verified staging engine ladder. The CRM route and engine
// remain authoritative for every move and gate check.
export type StageLane = Exclude<DeskLane, 'lead'>;

export const STAGES_BY_LANE: Record<StageLane, readonly string[]> = {
  secondaryOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'OFFER', 'NEGOTIATION', 'AGREED'],
  sellOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'VALUATION', 'LISTING_SIGNED', 'LIVE', 'OFFER', 'NEGOTIATION', 'SOLD'],
  offplanOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'SHORTLISTED', 'RESERVED', 'SPA_SIGNED', 'BOOKED'],
  rcbiOpportunity: ['NEW', 'CONTACTED', 'QUALIFIED', 'COMPLIANCE_CHECK', 'CONSULTATION', 'PARTNER_ENGAGED', 'APPLICATION', 'CONVERTED'],
  institutionalOpportunity: ['QUALIFY_MANDATE', 'THESIS_SOURCE', 'LOI', 'DUE_DILIGENCE', 'IC_APPROVAL', 'STRUCTURING_SPA', 'CLOSE_TRANSFER', 'PASSED'],
  listing: ['DRAFT', 'AWAITING_PUBLISH', 'LIVE', 'UNDER_OFFER', 'CLOSED'],
  deal: ['AGREED', 'SECURED', 'CLEARANCE', 'TRANSFER', 'REGISTERED', 'COMMISSION_SETTLED', 'CLOSED', 'COLLAPSED'],
};

export const isStageLane = (lane: DeskLane): lane is StageLane => lane !== 'lead';

// ── Shared ladder (the Kanban's 5 columns) ───────────────────────────────────
// MIRROR of the CRM repo's shared LADDER_MAP
// (/Users/yahyaismail/dev/_wt/my-desk/src/shared/my-desk-gates.ts), verified
// 2026-07-12. Every lane's native stages collapse onto ONE 5-column ladder so
// the board can show a mixed book in a single Kanban. Keep this in sync BY HAND
// with that source file — never invent a new mapping here. The engine + route
// stay authoritative for every actual move.
export type LadderStep = 'NEW' | 'WORKING' | 'NEGOTIATING' | 'CLOSING' | 'WON';

export const LADDER_STEPS: readonly LadderStep[] = ['NEW', 'WORKING', 'NEGOTIATING', 'CLOSING', 'WON'];

// Plain-language column headers (never the UPPER_CASE enum).
export const LADDER_LABEL: Record<LadderStep, string> = {
  NEW: 'New',
  WORKING: 'Working',
  NEGOTIATING: 'Negotiating',
  CLOSING: 'Closing',
  WON: 'Won',
};

export const LADDER_MAP: Record<StageLane, Record<string, LadderStep>> = {
  secondaryOpportunity: { NEW: 'NEW', CONTACTED: 'WORKING', QUALIFIED: 'WORKING', VIEWING: 'WORKING', OFFER: 'NEGOTIATING', NEGOTIATION: 'NEGOTIATING', AGREED: 'WON' },
  sellOpportunity: { NEW: 'NEW', CONTACTED: 'WORKING', QUALIFIED: 'WORKING', VALUATION: 'WORKING', LISTING_SIGNED: 'CLOSING', LIVE: 'WORKING', OFFER: 'NEGOTIATING', NEGOTIATION: 'NEGOTIATING', SOLD: 'WON' },
  offplanOpportunity: { NEW: 'NEW', CONTACTED: 'WORKING', QUALIFIED: 'WORKING', SHORTLISTED: 'WORKING', RESERVED: 'CLOSING', SPA_SIGNED: 'CLOSING', BOOKED: 'WON' },
  rcbiOpportunity: { NEW: 'NEW', CONTACTED: 'WORKING', QUALIFIED: 'WORKING', COMPLIANCE_CHECK: 'WORKING', CONSULTATION: 'WORKING', PARTNER_ENGAGED: 'NEGOTIATING', APPLICATION: 'CLOSING', CONVERTED: 'WON' },
  institutionalOpportunity: { QUALIFY_MANDATE: 'NEW', THESIS_SOURCE: 'WORKING', LOI: 'NEGOTIATING', DUE_DILIGENCE: 'WORKING', IC_APPROVAL: 'CLOSING', STRUCTURING_SPA: 'CLOSING', CLOSE_TRANSFER: 'WON' },
  listing: { DRAFT: 'NEW', AWAITING_PUBLISH: 'WORKING', LIVE: 'WORKING', UNDER_OFFER: 'NEGOTIATING', CLOSED: 'WON' },
  deal: { AGREED: 'NEW', SECURED: 'WORKING', CLEARANCE: 'WORKING', TRANSFER: 'CLOSING', REGISTERED: 'CLOSING', COMMISSION_SETTLED: 'CLOSING', CLOSED: 'WON' },
};

/** Which ladder column a lane's native stage sits in (null = a terminal/archived
 *  stage that isn't on the active ladder, e.g. ON_HOLD / LOST / PASSED). */
export const ladderStepOf = (lane: StageLane, stage: string): LadderStep | null =>
  LADDER_MAP[lane][(stage ?? '').toUpperCase()] ?? null;

/** Every native stage of `lane` that maps to `step` — the candidate targets for a
 *  drop onto that column. 0 = the lane can't reach this column; 1 = move direct;
 *  2+ = the agent must pick which real stage. */
export const stagesForLadderStep = (lane: StageLane, step: LadderStep): string[] =>
  STAGES_BY_LANE[lane].filter((stage) => LADDER_MAP[lane][stage] === step);
