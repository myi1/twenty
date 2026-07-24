// Local TypeScript contracts for the graduated Marketing Home dashboard.
//
// These mirror the SUBSET of the Propel serverless payloads this hero consumes
// (POST /s/marketing/analytics, /s/marketing/hub, /s/marketing/dashboard-layout).
// The canonical shapes live in the OTHER repo (propel-crm-integration):
//   src/shared/marketing-analytics-types.ts
//   src/shared/marketing-hub-types.ts
//   src/shared/marketing-presence.ts
// We deliberately do NOT import across repos — this file is the fork-local copy of
// only what the widgets read. Everything is optional / presence-guarded: the routes
// follow a strict "never show data you don't have" contract (docs/MARKETING-CLOUD.md),
// so the UI renders ONLY present:true blocks and never zero-fills.

import { type SendRulesPayload } from '@/propel/types/campaignBuilder';

// ── Presence wrapper (marketing-presence.ts) ─────────────────────────────────
export type Presence<T> =
  | { present: true; value: T }
  | { present: false; reason?: string };

export type AnalyticsRange = '7d' | '30d' | '90d';

export type RealChannel = 'EMAIL' | 'WHATSAPP';

export interface Metric {
  value: number;
  /** percentage change vs the prior equal window; null = no comparable base */
  deltaPct: number | null;
  /** optional server-bucketed sparkline points */
  spark?: number[];
}

export interface SeriesPoint {
  dayKey: string;
  label: string;
  value: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  isProxy?: boolean;
  ratePct?: number | null;
}

export interface ChannelTotals {
  channel: RealChannel;
  sent: number;
  delivered: number;
  deliveredIsProxy: boolean;
  openRate: number | null;
  replies: number;
  spark: number[];
}

export interface RevenueChannelSlice {
  source: string;
  label: string;
  revenue: number;
  deals: number;
}

export interface RevenueAttributed {
  total: number;
  deals: number;
  asOfLabel: string;
  byChannel: RevenueChannelSlice[];
  campaignTotal: number;
  confirmedRevenue: number;
  lastTouchRevenue: number;
}

export interface SocialEngagement {
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
}

// ── POST /s/marketing/analytics ──────────────────────────────────────────────
export interface MarketingAnalyticsPayload {
  tier?: string;
  /** Tabs this caller may open — decided server-side by shared/marketing-access.ts.
      Absent on older payloads, in which case the hero keeps its previous
      role-based behaviour rather than blanking the strip. */
  tabs?: string[];
  /** May trigger a real send, vs. submit-for-approval (maker-checker). */
  canSend?: boolean;
  /** May create/edit/delete templates, vs. read-only pick-from-list. */
  canEditTemplates?: boolean;
  range?: AnalyticsRange;
  generatedAtLabel?: string;
  kpis?: {
    sent?: Metric;
    openRate?: Metric; // value is a whole-number percent
    replies?: Metric;
    revenue?: Presence<RevenueAttributed>;
  };
  trend?: Presence<{
    series: SeriesPoint[];
    byChannel: { channel: RealChannel; values: number[] }[];
  }>;
  funnel?: { stages: FunnelStage[] };
  channels?: ChannelTotals[];
  social?: Presence<SocialEngagement>;
}

// ── POST /s/marketing/hub (subset) ───────────────────────────────────────────
export interface SendingNowRow {
  id: string;
  name: string;
  channel: RealChannel;
  sentCount: number;
  pendingLeft: number;
  failedCount: number;
  targetCount: number;
  startedLabel: string;
}

export interface AttentionRow {
  id: string;
  kind: 'FAILED_CAMPAIGN' | 'HOT_REPLY' | 'DEAD_LETTER';
  title: string;
  detail: string;
  whenLabel: string;
  campaignId?: string;
}

// ── Campaigns + Templates tab rows (fuller hub subset) ───────────────────────
// These mirror the additional MarketingHubPayload fields the Campaigns and
// Templates tabs of the unified hero read (canonical shapes:
// propel-crm-integration src/shared/marketing-hub-types.ts). The route owns ALL
// label formatting (Asia/Dubai); the UI renders strings.

export interface ScheduledRow {
  id: string;
  name: string;
  whenLabel: string;
  audienceLabel: string;
  channel: RealChannel;
}

export interface DraftRow {
  id: string;
  name: string;
  updatedLabel: string;
  channel: RealChannel | 'SOCIAL';
  hasSegment: boolean;
  hasListing: boolean;
}

export interface ResultRow {
  id: string;
  name: string;
  channel: RealChannel;
  completedLabel: string;
  openRate: number | null;
  clickRate: number | null;
  replies: number;
  callTasks: number;
  statsSettling: boolean;
}

export interface SequenceStepDraft {
  name: string;
  stepType:
    | 'SEND_EMAIL'
    | 'SEND_WHATSAPP'
    | 'WAIT'
    | 'CONDITION'
    | 'CREATE_TASK'
    | 'EXIT';
  channel: 'EMAIL' | 'WHATSAPP' | null;
  waitDays: number | null;
  templateSubject: string | null;
  templateBody: string | null;
  conditionKind: 'REPLIED' | 'OPENED' | 'CLICKED' | null;
  whatsappTemplateId: string | null;
  whatsappLanguageCode: 'EN' | 'AR' | null;
  yesStepIndex: number | null;
  noStepIndex: number | null;
}

export interface SequenceRow {
  id: string;
  name: string;
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'ARCHIVED';
  entryType: 'SEGMENT_POLL' | 'MANUAL' | 'EVENT';
  entrySegmentId: string | null;
  activeVersion: number;
  enrolledCount: number;
  activeCount: number;
  steps: SequenceStepDraft[];
}

// ── POST /marketing/campaign-detail (single-campaign drill-in) ───────────────
// Mirrors the SUBSET of the route's CampaignDetailPayload the unified Marketing
// hero's CampaignDetail surface reads (canonical shape: propel-crm-integration
// src/shared/marketing-hub-types.ts). The route owns ALL label formatting
// (Asia/Dubai) and the plain-English problem/action; the UI renders strings and
// never zero-fills (KPI tiles + funnel are gated on isSent, recipient activity
// hides when empty).
export interface RecipientActivityRow {
  recipientId: string;
  displayName: string;
  contactLabel: string; // e164 for WhatsApp, masked email otherwise
  state: 'OPENED' | 'CLICKED' | 'REPLIED';
  activityLabel: string;
  whenLabel: string;
  personId: string | null;
  isReplied: boolean;
}

export interface CampaignDetailPayload {
  ok: boolean;
  id: string;
  name: string;
  status: string; // DRAFT | SCHEDULED | SEND_REQUESTED | MATERIALIZING | SENDING | SENT | FAILED | CANCELLED
  statusLine: string; // "Sent — finished 15h ago"
  channel: RealChannel;
  audienceLabel: string; // segment or listing name ('' when unset)
  timeline: { label: string; whenLabel: string }[]; // Created / Scheduled / Started / Finished
  targetCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number; // live PENDING+SENDING+HELD recipients
  openCount: number;
  clickCount: number;
  replyCount: number;
  openRate: number | null;
  clickRate: number | null;
  statsSettling: boolean;
  subject: string | null;
  bodyPreview: string; // first 600 chars of the template body
  language: string;
  ab:
    | null
    | { winner: string | null; openA: number; openB: number; replyA: number; replyB: number };
  problem: string | null; // plain-English what went wrong
  problemAction: string | null; // plain-English what to do about it
  techDetail: string | null; // raw errorSummary for whoever wants it
  recipientActivity: RecipientActivityRow[]; // engaged recipients (empty = none / pruned)
  recipientActivityTotal: number; // total engaged (for the "+N more" footer)
  error?: string;
}

export interface WaTemplateOption {
  id: string;
  name: string;
  languageCode: 'EN' | 'AR';
  category: string;
  bodyText: string;
  paramMap: string[];
  bodyExample: string[];
  status: string;
  approved: boolean;
  metaTemplateId: string;
  rejectionReason: string;
}

export interface EmailTemplateOption {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  languageCode: string;
}

export interface CustomFieldOption {
  id: string;
  key: string;
  value: string;
  label: string;
}

export interface MarketingHubPayload {
  tier?: string;
  /** Tabs this caller may open — decided server-side by shared/marketing-access.ts.
      Absent on older payloads, in which case the hero keeps its previous
      role-based behaviour rather than blanking the strip. */
  tabs?: string[];
  /** May trigger a real send, vs. submit-for-approval (maker-checker). */
  canSend?: boolean;
  /** May create/edit/delete templates, vs. read-only pick-from-list. */
  canEditTemplates?: boolean;
  /** Workspace members for the Settings → Approvals picker (COORDINATOR only). */
  members?: { id: string; name: string }[];
  greeting?: string;
  generatedAtLabel?: string;
  sendingNow?: SendingNowRow[];
  sendingNowTotal?: number;
  needsAttention?: AttentionRow[];
  firstRun?: boolean;
  // Campaigns tab
  scheduled?: ScheduledRow[];
  drafts?: DraftRow[];
  recentResults?: ResultRow[];
  sequences?: SequenceRow[];
  // Templates tab
  waTemplates?: WaTemplateOption[];
  emailTemplates?: EmailTemplateOption[];
  customFields?: CustomFieldOption[];
  // Settings tab (Send rules section). The /marketing/hub route already returns
  // this singleton (surfaced today only in campaign Review via the builder's
  // CampaignBuilderHubPayload); typing it here lets the Settings tab read
  // `hub.sendRules` from the SAME shared fetch — no new route. Presence-guarded
  // like every field; absent → the section falls back to DEFAULT_SEND_RULES.
  sendRules?: SendRulesPayload;
}

// ── POST /s/marketing/dashboard-layout ───────────────────────────────────────
// Persisted per-user grid arrangement. `layouts` is stored opaquely server-side
// (it is react-grid-layout's `Layouts` keyed by breakpoint, plus our list of
// enabled widget ids). null until the user has saved a custom arrangement.
export interface DashboardLayoutGetResponse {
  ok?: boolean;
  layouts?: PersistedDashboardLayout | null;
}

export interface DashboardLayoutSetResponse {
  ok?: boolean;
  error?: string;
}

// Our own opaque payload shape (the route never interprets it).
export interface PersistedDashboardLayout {
  layouts: import('react-grid-layout').Layouts;
  enabledWidgetIds: string[];
}
