// Unified Inbox types — ported verbatim from the legacy app-sandbox
// (propel-crm-integration src/shared/marketing-hub-types.ts, "Unified Inbox (S8)").
//
// The Inbox hero tab is a Mantine rebuild of the legacy InboxView, but it talks to
// the SAME, UNCHANGED logic-function routes (/marketing/inbox, /marketing/inbox-thread,
// /marketing/inbox-reply, /marketing/inbox-ai, /marketing/inbox/save-media), so these
// payload shapes must stay in lockstep with the server contract. Keeping them here
// (not re-derived) means the renderer only ever branches on known enum members and a
// route shape change is a single edit.

export type InboxChannel = 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP';

// COMMENT (FB/IG post comment) vs DM (FB/IG direct message). WhatsApp threads are
// always conversational, so the list/thread routes report 'DM' for them; the
// distinction only carries weight on the FB/IG surface (it routes the outbound
// reply: comment-reply Graph call vs Messenger Send API).
export type InboxSurface = 'COMMENT' | 'DM';

// Lead Engine S1 — the channel-agnostic triage class the inbox route normalizes
// every thread to (from whatsAppConversation.senderType etc.). UNKNOWN = no triage
// signal yet (FB/IG carry no triage columns), shown as "needs a human look".
export type InboxTriageClass =
  | 'OPPORTUNITY'
  | 'LEAD'
  | 'BROWSER'
  | 'SPAM'
  | 'UNKNOWN';

// The acting member's capability role (from /marketing/inbox). AGENT → own threads
// only, no pool-assignment controls; MANAGER/ADMIN → triage the whole intake pool.
export type InboxViewerRole = 'ADMIN' | 'MANAGER' | 'AGENT';

export interface InboxThreadRow {
  id: string;
  channel: InboxChannel;
  surface: InboxSurface; // COMMENT vs DM (FB/IG); WhatsApp → DM
  title: string; // contact / commenter name (or handle)
  preview: string; // last message body, trimmed (server-truncated)
  whenLabel: string; // "14m ago" (Asia/Dubai)
  lastAtMs: number; // sort key (client never re-derives time)
  unreadCount: number;
  status: string; // NEW | OPEN | WAITING | RESOLVED
  personId: string | null; // deep-link to the matched Person ('' → unmatched)
  contactName: string; // matched person name ('' if unmatched)

  // ── Lead Engine S1: triage-queue enrichment (from /marketing/inbox) ──────────
  // Operational metadata only — all degrade-safe: a row with no triage data shows
  // fewer signals, never a fabricated one. Lockstepped with marketing-inbox-route.
  triageClass: InboxTriageClass; // normalized class (UNKNOWN when no triage data)
  triageReason: string; // short why-string from triage ('' when none)
  assignedAgentId: string | null; // lead owner ('' / null → unowned)
  assignedAgentName: string; // resolved agent name ('' when unowned)
  leadSource: string | null; // META | PROPERTY_FINDER | CAMPAIGN | …
  contactType: string | null; // LEAD | CLIENT | …
  needsTriage: boolean; // unowned + real-intent/unclassified → wants a human
  ageMs: number | null; // ms since first enquiry (null when unknown) — SLA heat
  slaBreached: boolean; // source SLA window lapsed without a first response
  suggestedAgentId: string | null; // deterministic suggestion (null when none)
  suggestedAgentName: string; // resolved suggested-agent name ('' when none)
  suggestedReason: string; // why this agent ('' when none)
}

export interface InboxPresence {
  facebook: boolean; // a CONNECTED Facebook socialAccount exists
  instagram: boolean; // a CONNECTED Instagram socialAccount exists
  whatsapp: boolean; // a PAIRED whatsAppIdentity exists
}

export interface InboxPayload {
  tier: string;
  generatedAtLabel: string;
  presence: InboxPresence;
  threads: InboxThreadRow[]; // unioned, recency-desc, capped; empty → list hides
  totalUnread: number;
  // Lead Engine S1 — the acting member's role, so the UI shows pool-triage controls
  // (assign / create-opp) to MANAGER/ADMIN only. Optional for back-compat with an
  // older route response (treated as 'AGENT' when absent).
  viewerRole?: InboxViewerRole;
  // The acting member's own workspaceMember id (from /marketing/inbox). Used by the
  // "Mine" segment to show only threads assigned to me (assignedAgentId === this).
  // Optional for back-compat with an older route response.
  viewerWorkspaceMemberId?: string;
  // Pre-derived count of needs-triage threads in the capped slice (server-side).
  // Optional; the client also derives it locally as a fallback.
  needsTriageCount?: number;
}

// ── Lead quick-action route envelopes (POST /lead/*) ──────────────────────────
// Gated, event-emitting routes — the component NEVER mutates directly. Flat
// event.body (callPropelRoute flat payload), same as the other inbox routes.
export interface LeadAssignResponse {
  ok?: boolean;
  personId?: string;
  agentId?: string;
  mode?: string; // 'noop' when already assigned to that agent
  error?: string;
  operatorAction?: string;
}

export interface LeadCreateOpportunityResponse {
  ok?: boolean;
  opportunityId?: string;
  error?: string;
  operatorAction?: string;
}

// An agent option for the assign picker (from the workspaceMembers directory).
export interface InboxAgentOption {
  id: string;
  name: string;
  available: boolean;
}

// ── Lead events (POST /lead/events) ──────────────────────────────────────────
// One row of the append-only leadEvent log for a subject (Person / opportunity /
// deal / conversation). Operational metadata ONLY (no PII / message content) — the
// object is broadly readable, so the route gates the UI, not confidentiality.
// Lockstepped with lead-events-route.ts (and the leadEvent object's SELECT enums).
export type LeadEventType =
  | 'LEAD_CREATED'
  | 'LEAD_ASSIGNED'
  | 'LEAD_REASSIGNED'
  | 'LEAD_RESPONDED'
  | 'OPPORTUNITY_CREATED'
  | 'STAGE_CHANGED'
  | 'DEAL_WON'
  | 'DEAL_LOST'
  | 'LEAD_SLA_BREACHED'
  | 'LEAD_CLASSIFIED'
  | 'AGENT_SUGGESTED'
  | 'HUMAN_OVERRODE'
  | 'REPLY_DRAFTED';

export type LeadEventActorKind = 'USER' | 'SYSTEM' | 'CRON' | 'CONNECTOR';

export interface LeadEventNode {
  id: string;
  eventType: LeadEventType | string;
  occurredAt: string | null; // ISO; null when unset
  actorKind: LeadEventActorKind | string | null;
  actorWorkspaceMemberId: string | null; // real id only from gated routes
  payload: unknown; // operational metadata blob (object | string | null)
}

export interface LeadEventsResponse {
  ok?: boolean;
  subjectObjectType?: string;
  subjectRecordId?: string;
  count?: number;
  events?: LeadEventNode[];
  error?: string;
  operatorAction?: string;
}

// Inbound/outbound media kind, mirroring the whatsAppMessage `mediaKind` SELECT
// (NONE = text-only).
export type InboxMediaKind =
  | 'NONE'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'STICKER';

export interface InboxMessageRow {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  authorName: string;
  whenLabel: string;
  sentAtMs: number;
  // Inbound/outbound media surfaced from the channel's message record. WhatsApp
  // captures a durable mediaUrl/mediaKind; FB/IG carry a PERISHABLE Meta CDN link
  // until saved. A null url renders as plain text.
  mediaUrl: string | null;
  mediaKind: InboxMediaKind;
  // Save-on-demand (FB/IG): mediaPersisted=true means re-hosted to B2 ("Saved");
  // false means a Meta CDN link that will expire — the renderer shows an expiry
  // indicator + a "Save" button. mediaExpiresAtMs is the parsed oe= expiry (epoch
  // ms) driving a live countdown, or null when absent. WhatsApp rows are always
  // persisted (true) with a null expiry — the save/expiry UI is FB/IG only.
  mediaPersisted: boolean;
  mediaExpiresAtMs: number | null;
}

// At-a-glance contact card for the context rail. Every field beyond id/name is
// presence-aware (null when the linked Person doesn't carry it).
export interface InboxContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadSource: string | null; // e.g. META, PROPERTY_FINDER
  contactType: string | null; // e.g. LEAD, CLIENT
}

// The linked deal shown in the context rail. null when the contact has no deal.
export interface InboxDeal {
  id: string;
  name: string;
  stage: string;
  side: string | null;
}

export interface InboxThreadPayload {
  ok: boolean;
  id: string;
  channel: InboxChannel;
  surface: InboxSurface; // COMMENT vs DM — routes the outbound reply (FB/IG)
  title: string;
  status: string;
  personId: string | null;
  contactName: string;
  contact: InboxContact | null;
  deal: InboxDeal | null;
  canReply: boolean; // false when the thread can't accept an outbound reply yet
  replyHint: string; // why reply is disabled ('' when canReply)
  messages: InboxMessageRow[]; // chronological (oldest → newest)
  error?: string;
}

// ── Inbox AI (POST /marketing/inbox-ai) ──────────────────────────────────────
// Three modes over one thread: suggest (blank composer → draft a reply), improve
// (a draft is present → tighten it), insights (right-rail summary). LLM-gated: an
// unset key returns a typed ENV_MISSING envelope, never a fake reply.
export interface InboxAiInsightsPayload {
  summary: string;
  sentiment: string;
  nextStep: string;
}

export interface InboxAiResponse {
  ok?: boolean;
  text?: string; // suggest / improve
  insights?: InboxAiInsightsPayload; // insights
  error?: string;
  code?: string;
  operatorAction?: string;
}

// ── Reply route envelope (POST /marketing/inbox-reply) ───────────────────────
export interface ReplySendEnvelope {
  ok?: boolean;
  warning?: string;
  error?: string;
  operatorAction?: string;
}

// ── Outbound media kind ──────────────────────────────────────────────────────
// The reply route routes an attachment on this kind (a subset of InboxMediaKind —
// STICKER is inbound-only). The composer tags an upload with it from its
// content-type so the route picks the right WhatsApp media kind / Meta type.
export type OutboundMediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

// ── Quick replies (POST /inbox/quick-replies) ────────────────────────────────
// The shared canned-reply library for the composer picker. Any authenticated
// member may read (agents USE them; managers CURATE via the standard record UI).
// The client groups by `category` (blank → "General") and filters by title+body.
// Shape lockstepped with quick-replies-list-route.ts.
export interface QuickReply {
  id: string;
  title: string;
  body: string;
  category: string;
  languageCode: 'EN' | 'AR';
}

export interface QuickRepliesPayload {
  ok?: boolean;
  quickReplies?: QuickReply[];
  error?: string;
}
