// Local TypeScript contracts for the graduated Campaign / AI Builder hero.
//
// These mirror the SUBSET of the Propel serverless route payloads this hero
// reads/writes. The canonical shapes live in the OTHER repo
// (propel-crm-integration: src/shared/marketing-hub-types.ts, the
// src/logic-functions/marketing-* route files). We deliberately do NOT import
// across repos — this is the fork-local copy of only what the builder touches.
//
// Every server payload is presence-/optional-guarded: the routes follow a strict
// "never show data you don't have" contract (docs/MARKETING-CLOUD.md), so the UI
// renders only fields that are actually present and NEVER zero-fills.

export type RealChannel = 'EMAIL' | 'WHATSAPP';
export type TemplateLanguage = 'EN' | 'AR';

// ── A/B test config (S2) ─────────────────────────────────────────────────────
// The marketingCampaign object already carries the full A/B schema and the
// detail view already READS the result; S2 is purely the missing FRONT DOOR.
// This is the wizard-local slice — composed into the wizard state orthogonally
// so later slices merge cleanly. The field names below map 1:1 onto the
// /marketing/save-campaign body keys (see marketing-save-campaign-route.ts):
//   abEnabled · abSubjectB · abBodyB · abSlicePct · abWinnerMetric ·
//   abDecideAfterHours · abMinEvents  (abTemplateBId reserved for WA A/B, S-later).
export type AbWinnerMetric = 'OPENS' | 'REPLIES';

export interface AbConfig {
  enabled: boolean;
  subjectB: string; // EMAIL variant B
  bodyB: string; // EMAIL variant B
  // WhatsApp variant B = a second approved template (the WA body IS the
  // template; there's no free copy). Maps to save-campaign's abTemplateBId,
  // which the route already accepts. null = no B template chosen yet.
  templateBId: string | null;
  slicePct: number; // 5–50; the % of the audience the A/B test samples
  winnerMetric: AbWinnerMetric;
  decideAfterHours: number; // > 0
  minEvents: number; // >= 0
}

export const DEFAULT_AB_CONFIG: AbConfig = {
  enabled: false,
  subjectB: '',
  bodyB: '',
  templateBId: null,
  slicePct: 20,
  winnerMetric: 'OPENS',
  decideAfterHours: 24,
  minEvents: 50,
};

// ── marketingSendRule singleton (S3 — Review guardrails) ─────────────────────
// The send governance the drain enforces on EVERY send: weekly caps (all-channel
// + a stricter WhatsApp cap), a nightly quiet window, and a Friday pause. The
// /marketing/hub route already returns this (sendRules) — S3 surfaces it in
// Review so the user understands BEFORE launch why a blast might be throttled,
// not after. Times are Asia/Dubai "HH:MM". Mirrors src/shared/marketing-hub-types
// SendRulesPayload + DEFAULT_SEND_RULES_PAYLOAD in the CRM repo.
export interface SendRulesPayload {
  id?: string | null;
  capPerWeek: number;
  capPerWeekWhatsapp: number;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  fridayPauseEnabled: boolean;
  fridayPauseUntil: string;
}

// ── /marketing/hub (the subset the builder needs for its pickers) ────────────
export interface SegmentOption {
  id: string;
  name: string;
  lastResolvedCount: number;
  lastResolvedLabel: string;
}

export interface ListingOption {
  id: string;
  name: string;
  permitOk: boolean;
}

export interface WaTemplateOption {
  id: string;
  name: string;
  languageCode: TemplateLanguage;
  category: string;
  bodyText: string;
  paramMap: string[];
  status: string;
  approved: boolean;
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

// Only the slice of the hub payload the builder consumes (the full payload also
// carries boards/results the builder never reads — those stay absent here).
export interface CampaignBuilderHubPayload {
  tier?: string;
  segments?: SegmentOption[];
  listings?: ListingOption[];
  waTemplates?: WaTemplateOption[];
  emailTemplates?: EmailTemplateOption[];
  customFields?: CustomFieldOption[];
  // The send-rules singleton (S3 Review guardrails). The /marketing/hub route
  // already includes this; it is optional/presence-guarded like every payload.
  sendRules?: SendRulesPayload;
}

// ── Typed error envelope (marketing-io.envelope) ─────────────────────────────
// Every route returns either an `ok` payload OR an envelope with `error`/`code`/
// `operatorAction`. The UI shows operatorAction (plain coordinator language)
// when present, else error, never a raw stack.
export interface RouteEnvelopeError {
  error?: string;
  code?: string;
  operatorAction?: string;
}

// ── /marketing/draft-copy ────────────────────────────────────────────────────
export interface DraftCopyResponse extends RouteEnvelopeError {
  ok?: boolean;
  subject?: string;
  body?: string;
  permitWarning?: string;
}

// ── /marketing/save-campaign ─────────────────────────────────────────────────
export interface SaveCampaignResponse extends RouteEnvelopeError {
  ok?: boolean;
  campaignId?: string;
  status?: string;
}

// ── /marketing/campaign-edit (S6 — listing-aware draft re-edit) ──────────────
// Loads a DRAFT campaign's editable fields back into the builder. S6 makes the
// builder listing-aware on reopen: a listing-backed draft re-hydrates the
// listing (objective → LISTING) and re-runs the permit gate, instead of being
// shunted to a read-only detail. The route's `editable` flag still gates
// genuinely non-editable campaigns (sent/sending/scheduled/system/SOCIAL).
//
// BACKEND TODO(S6-backend): the current /marketing/campaign-edit route
// (propel-crm-integration: src/logic-functions/marketing-campaign-edit-route.ts)
// returns editable:false when cmp.listingId is set, and does NOT return
// listingId or the A/B fields. For S6 it must:
//   1. treat a DRAFT, non-system EMAIL listing-backed campaign as editable;
//   2. return `listingId` (so the wizard re-hydrates the listing + re-gates the
//      permit) and the A/B config fields (abEnabled, abSubjectB, abBodyB,
//      abSlicePct, abWinnerMetric, abDecideAfterHours, abMinEvents,
//      abTemplateBId) so reopening a draft restores its A/B test instead of
//      silently dropping it on the next save.
// The fields below are typed as optional so the UI degrades gracefully against
// the not-yet-widened route (missing listingId → treated as a segment draft;
// missing A/B fields → A/B defaults), and lights up fully once it lands.
export interface CampaignEditResponse extends RouteEnvelopeError {
  ok?: boolean;
  editable?: boolean;
  campaignId?: string;
  status?: string;
  name?: string;
  channel?: RealChannel;
  subject?: string;
  body?: string;
  language?: TemplateLanguage;
  segmentId?: string | null;
  waTemplateId?: string | null;
  // S6 — present once the route is widened; absent on the current route.
  listingId?: string | null;
  abEnabled?: boolean;
  abSubjectB?: string;
  abBodyB?: string;
  abSlicePct?: number;
  abWinnerMetric?: AbWinnerMetric;
  abDecideAfterHours?: number;
  abMinEvents?: number;
  abTemplateBId?: string | null;
}

// ── /marketing/test-send ─────────────────────────────────────────────────────
export interface TestSendResponse extends RouteEnvelopeError {
  ok?: boolean;
  sentTo?: string;
  subject?: string;
}

// ── /marketing/send-request ──────────────────────────────────────────────────
export interface SendRequestResponse extends RouteEnvelopeError {
  ok?: boolean;
  campaignId?: string;
  status?: string;
}

// ── /marketing/segment-preview ───────────────────────────────────────────────
// rulesPreview (P2.5): when the request sets `rulesPreview: true`, the route runs
// the SAME cap-exclusion pass the materializer applies at fire time over the
// resolved recipients and returns how many would be skipped for hitting their
// weekly cap — the honest, deterministic number the Review guardrails surface.
export interface SegmentRulesPreview {
  capReached: number;
  // The send-rules snapshot the cap pass ran with (echoed for the caller; the
  // guardrails card already has its own copy from /marketing/hub, so this is
  // informational and intentionally loosely typed).
  rules?: unknown;
}

export interface SegmentPreviewResponse extends RouteEnvelopeError {
  ok?: boolean;
  channel?: RealChannel;
  estimate?: number;
  description?: string;
  note?: string;
  rulesPreview?: SegmentRulesPreview;
}

// The Review cap-skip preview state (S3 guardrails). How many of the chosen
// audience would be skipped for having already hit their weekly cap — resolved
// by the SAME pass the materializer runs at fire time. Honest by construction:
// 'error' renders as "couldn't check" (never zero-filled), and the count is only
// trusted in the 'loaded' state.
export type CapPreview =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'loaded'; capReached: number }
  | { state: 'error' };

// ── /marketing/save-segment ──────────────────────────────────────────────────
export interface SaveSegmentResponse extends RouteEnvelopeError {
  ok?: boolean;
  segmentId?: string;
  estimate?: number;
  description?: string;
  channel?: RealChannel;
}

// ── /marketing/pool-segments (Pools ↔ Marketing Cloud audience picker) ────────
// The lead/nurture/lane POOLS become live dynamic segments the audience picker
// can select. Backend = marketing-pool-segments-route.ts (CRM repo, branch
// feat/pools-marketing-segments). Two modes:
//   • { mode: 'catalog' } → the selectable pools (no DB row; a pool is a named
//     criteria recipe).
//   • { mode: 'resolve', poolKey, channel?, includeActive? } → that pool's LIVE
//     membership resolved to a recipient estimate + exclusion breakdown + the
//     criteria (+ membership filter) the campaign-builder must PERSIST onto the
//     campaign's segment so send-start re-resolves the SAME live audience.
export type PoolKind = 'LEAD_POOL' | 'NURTURE' | 'LANE';

export interface PoolCatalogEntry {
  key: string;
  kind: PoolKind;
  label: string;
  description: string;
  // When true the "include locked/owned/active" override defaults OFF (broad-blast
  // suppression ON) — i.e. a LANE pool. Lead/nurture pools are already unowned, so
  // this is false there and the toggle is a no-op (we hide it).
  broadBlastDefault: boolean;
}

export interface PoolCatalogResponse extends RouteEnvelopeError {
  ok?: boolean;
  pools?: PoolCatalogEntry[];
}

// The membership filter a pool needs ON TOP of its criteria. The resolver has no
// positive POOL/nurture axis, so the route applies it; LANE pools fold membership
// into criteria.lanes[] and return null here. Mirrors pool-segments.MembershipFilter.
export type PoolMembershipFilter =
  | { kind: 'POOL' }
  | { kind: 'NURTURE'; tier: 'WARM' | 'COLD' }
  | null;

export interface PoolResolveResponse extends RouteEnvelopeError {
  ok?: boolean;
  poolKey?: string;
  kind?: PoolKind;
  channel?: RealChannel;
  includeActive?: boolean;
  // The criteria (+ membership) the campaign-builder persists onto the segment.
  segment?: {
    criteria: SegmentCriteriaV2;
    membership: PoolMembershipFilter;
  };
  estimate?: number;
  exclusions?: Record<string, number>;
  description?: string;
  note?: string;
}

// ── /marketing/import-segment (two-phase: preview → commit) ───────────────────
export interface ImportColMap {
  email: number | null;
  phone: number | null;
  firstName: number | null;
  lastName: number | null;
  fullName: number | null;
}

// An assignable agent for the "Assign new contacts to" picker. Returned by the
// import route's `mode: 'agents'` branch (managers + agents in the workspace).
export interface ImportAgentOption {
  id: string;
  label: string;
}

export interface ImportPreviewResponse extends RouteEnvelopeError {
  ok?: boolean;
  mode?: string;
  headers?: string[];
  detected?: ImportColMap;
  sampleRows?: string[][];
  totalRows?: number;
  format?: string;
  // Present only on the `mode: 'agents'` response: the assignable roster and the
  // uploader's own id (so the picker can default to "me" without a second call).
  agents?: ImportAgentOption[];
  selfId?: string;
}

export interface ImportCommitResponse extends RouteEnvelopeError {
  ok?: boolean;
  segmentId?: string;
  name?: string;
  listSize?: number;
  matched?: number;
  created?: number;
  inFileDuplicates?: number;
  unusable?: number;
  createFailed?: number;
  // The agent the new contacts were assigned to (echoed back for confirmation).
  assignedAgentId?: string | null;
  capped?: boolean;
}

// ── Segment criteria (segment-resolver SegmentCriteriaV2) ─────────────────────
// The builder writes v2 only; the criteria editor produces { version: 2,
// sources?, lastTouchOlderThanDays? }. The resolver upconverts v1 forever.
export interface SegmentCriteriaV2 {
  version: 2;
  sources?: string[];
  lastTouchOlderThanDays?: number;
  personIds?: string[];
  lanes?: string[];
  budgetMin?: number;
  budgetMax?: number;
  locations?: string[];
  oppStages?: string[];
  // Broad-blast suppression: when true, leads that are LOCKED / OWNED / in an
  // ACTIVE opportunity are excluded. A LANE pool defaults this ON; the audience
  // picker's "include locked/owned/active" override sets it false (carried back
  // by /marketing/pool-segments resolve in segment.criteria).
  suppressLockedOwnedActive?: boolean;
}

// ── /marketing/ai-build ──────────────────────────────────────────────────────
// The LLM proposes a plan; the server runs a TRUTH PASS (real segment count,
// permit/template/cap verification) before returning. The plan cards show the
// VERIFIED numbers (truth), never the LLM's own claims.
export interface AiPlan {
  channel: string;
  segmentCriteria: unknown;
  segmentDescription: string;
  estimatedAudience?: number | null;
  subject: string | null;
  body: string | null;
  whatsappTemplateId: string | null;
  scheduledAt: string | null;
  language: string;
}

export interface AiTruth {
  segmentCount: number | null;
  capExcludedEstimate: number;
  permitOk: boolean | null;
  permitWarning: string | null;
  templateApproved: boolean | null;
  templateWarning: string | null;
  sendWindowOk: boolean;
}

export interface AiBuildResponse extends RouteEnvelopeError {
  ok?: boolean;
  conversationId?: string;
  plan?: AiPlan | null;
  truth?: AiTruth | null;
  thinking?: string;
  question?: string | null;
}

export type AiChatRole = 'user' | 'assistant';
export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}
