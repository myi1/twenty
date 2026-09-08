// MIRROR of propel-crm-integration/src/shared/team-scorecard-types.ts — the payload
// contract of POST /team-scorecard (the Team Scorecard hero's route). Keep the two
// files identical (same convention as the marketing-hub types). Change both together.

export type ScorecardWindowPreset = 'today' | 'yesterday' | '7d' | '30d' | 'since';

export interface ScorecardWindowInput {
  preset: ScorecardWindowPreset;
  since?: string;
  until?: string;
}

export interface ScorecardWindow {
  preset: ScorecardWindowPreset;
  startKey: string;
  endKey: string;
  startIso: string;
  endIso: string;
  days: number;
  label: string;
}

export type ScorecardScope = 'TEAM' | 'MINE';

export type ScorecardViewerRole = 'ADMIN' | 'MANAGER' | 'AGENT';

export interface ScorecardTargets {
  coverage24hPct: number;
  breachMaxPct: number;
  firstAttemptMinutes: number;
  activeAgentsMin: number;
}

export interface Ratio {
  n: number;
  of: number;
  pct: number | null;
}

export type SectionStatus = { status: 'ok' } | { status: 'unavailable'; reason: string };

export interface FirstAttemptBands {
  within15: number;
  within60: number;
  within24h: number;
  later: number;
  unknown: number;
}

export interface ScorecardHeadline {
  newLeads: number;
  handedToAgent: Ratio & {
    nowWithAgent: number;
    backOnDesk: number;
    neverLeftDesk: number;
    unassigned: number;
  };
  outcome24h: Ratio & {
    pending: number;
    approx: boolean;
    anyTime: number;
  };
  firstAttempt: {
    medianMinutes: number | null;
    outcomes: number;
    bands: FirstAttemptBands;
    approx: boolean;
  };
  whatsapp24h: Ratio & {
    pending: number;
    /** Outbound rows with no recorded sender — never counted as agent messages. */
    unattributed: number;
    excludedAutomated: number;
  };
  missedClock: Ratio & {
    slaMinutes: number | null;
    taskOverdue: number;
    tasksBreached: number;
    tasksTotal: number;
    handoffs: number;
    handoffsSla: number;
    handoffsIdle: number;
  };
  pipelineMotion: {
    moved: number;
    judged: number;
    pct: number | null;
    tooEarly: number;
    noDeal: number;
    withDeal: number;
    approx: boolean;
  };
  adoption: {
    active: number;
    received: number;
    agentRoleCount: number | null;
  };
}

export type ScorecardPersonGroup = 'DESK' | 'AGENT';

export interface ScorecardPersonRow {
  memberId: string;
  name: string;
  group: ScorecardPersonGroup;
  isViewer: boolean;
  leadsHeld: number;
  outcome24h: number;
  outcomeAny: number;
  medianMinutes: number | null;
  timedOutcomes: number;
  whatsapp24h: number;
  missedClock: number;
  taskOverdue: number;
  handedOff: number;
}

export interface ScorecardSourceRow {
  sourceKey: string;
  label: string;
  newLeads: number;
  handedToAgent: number;
  outcome24h: number;
  whatsapp24h: number;
  missedClock: number;
}

export interface ScorecardTrendPoint {
  dayKey: string;
  label: string;
  newLeads: number;
  outcome24h: number;
}

export interface ScorecardSections {
  whatsapp: SectionStatus;
  pipeline: SectionStatus;
  events: SectionStatus;
  roles: SectionStatus;
}

export interface ScorecardSummaryPayload {
  ok: true;
  scope: ScorecardScope;
  viewer: { memberId: string; name: string | null; role: ScorecardViewerRole };
  window: ScorecardWindow;
  computedAtIso: string;
  computedLabel: string;
  targets: ScorecardTargets;
  headline: ScorecardHeadline;
  byPerson: ScorecardPersonRow[];
  personRowsCollapsed: number;
  bySource: ScorecardSourceRow[];
  trend: ScorecardTrendPoint[];
  sections: ScorecardSections;
  caveats: string[];
  durationMs: number;
}

export type ScorecardDrillMetric =
  | 'all'
  | 'onDesk'
  | 'handed'
  | 'outcome'
  | 'noOutcome'
  | 'pending'
  | 'whatsapp'
  | 'missed'
  | 'moved'
  | 'noDeal';

export interface ScorecardLeadRow {
  personId: string;
  name: string;
  source: string;
  arrivedLabel: string;
  holderName: string | null;
  holderGroup: ScorecardPersonGroup | null;
  state: string;
}

export interface ScorecardLeadsPayload {
  ok: true;
  metric: ScorecardDrillMetric;
  rows: ScorecardLeadRow[];
  nextCursor: string | null;
  total: number;
}

export type ScorecardErrorCode = 'NOT_AVAILABLE' | 'BAD_REQUEST' | 'LOOKUP_FAILED';

export interface ScorecardErrorPayload {
  ok: false;
  error: ScorecardErrorCode;
  message?: string;
}

export const SCORECARD_LEADS_PAGE_SIZE = 40;
export const SCORECARD_MAX_WINDOW_DAYS = 90;
export const SCORECARD_TREND_MAX_DAYS = 14;
