// ─────────────────────────────────────────────────────────────────────────────
// My Desk — hero-side type mirror
// ─────────────────────────────────────────────────────────────────────────────
// The CRM repo (propel-crm-integration) and this fork can't share imports, so
// these types are a hand-maintained MIRROR — keep them in sync manually when the
// source files change.
//
//   DeskBand / DeskLane / DeskRow  ← mirrored VERBATIM from
//     /Users/yahyaismail/dev/_wt/my-desk/src/shared/my-desk-core.ts (CRM repo)
//
//   Desk*Item / Desk*Response      ← mirror the exact shapes emitted by the
//     `/my-desk` route:
//     /Users/yahyaismail/dev/_wt/my-desk/src/logic-functions/my-desk-route.ts
//     (rail's `unreadWa` items and waContext's `templates` items additionally
//     line up with whatsAppConversation's rail selection and
//     /Users/yahyaismail/dev/_wt/my-desk/src/shared/wa-reengagement.ts's
//     `WaTemplateLite`, respectively.)

// ── my-desk-core.ts mirror (verbatim) ────────────────────────────────────────

export type DeskBand = 'slaAtRisk' | 'overdue' | 'dueToday' | 'rest';
export type DeskLane =
  | 'lead' | 'secondaryOpportunity' | 'sellOpportunity' | 'offplanOpportunity'
  | 'rcbiOpportunity' | 'institutionalOpportunity' | 'listing' | 'deal';

export type DeskRow = {
  id: string;                    // `${laneObject}:${recordId}` — stable row key
  laneObject: DeskLane;
  recordId: string;
  personId: string | null;
  phoneE164: string | null;
  hasWhatsApp: boolean;
  name: string;
  meta: string;                  // one-line context ("Downtown 1BR · Meta lead")
  stage: string;                 // the lane's NATIVE stage enum value
  valueAed: number | null;
  nextAction: string | null;
  nextActionTaskId: string | null;
  nextActionDueAt: string | null;
  nextActionSource: 'task' | 'stageMap' | 'ai';
  lastTouchAt: string | null;
  slaDeadline: string | null;    // set only for lead rows inside/past the reply window
  snoozedUntil: string | null;
  unreadWa: number;
  viewingTodayAt: string | null;
  taskDueToday: boolean;
};

// ── my-desk-route.ts response mirrors ────────────────────────────────────────

/** Every action shares this failure envelope (auth check runs before the
 *  action switch, so NOT_AUTHENTICATED can come back from any of the four). */
export type DeskErrorResponse = { ok: false; error: string };

// board — rows come pre-sorted needs-you-first (sortRows, server-side).
export type DeskBoardResponse =
  | { ok: true; rows: DeskRow[]; nextCursor: string | null }
  | DeskErrorResponse;

// rail — tasks/viewings/unreadWa/priorityLeads, each capped at RAIL_CAP (10).
// Each panel fails ALONE server-side (safeList) and degrades to `[]` — a panel
// that had a lookup error is indistinguishable, on the wire, from a genuinely
// empty one; only a `null`/`ok:false` response is a rail-wide failure.
export type DeskTaskItem = {
  id: string;
  title: string | null;
  status: string | null; // Task.status — 'TODO' | 'IN_PROGRESS' | … (rail only requests TODO/IN_PROGRESS)
  slaDueAt: string | null;
  kind: string | null;
};

export type DeskViewingItem = {
  id: string;
  name: string | null;
  scheduledAt: string | null;
  status: string | null; // 'REQUESTED' | 'SCHEDULED' | … (rail only requests these two)
};

export type DeskUnreadWaItem = {
  id: string;
  name: string | null;
  unreadCount: number | null;
  lastMessageAt: string | null;
  contactId: string | null;
};

export type DeskRailResponse =
  | {
      ok: true;
      tasks: DeskTaskItem[];
      viewings: DeskViewingItem[];
      unreadWa: DeskUnreadWaItem[];
      priorityLeads: DeskRow[];
    }
  | DeskErrorResponse;

/** The successful-response shape of the rail action — narrows out the shared
 *  `{ ok: false; error }` envelope so panel code never has to re-check `ok`.
 *  Shared across index.tsx / TodayStrip.tsx / RightRail.tsx (Task 12). */
export type DeskRailOk = Extract<DeskRailResponse, { ok: true }>;

// timeline — the peek-drawer event feed for one record (one page today;
// nextCursor is always null until a unified cursor across the 4 source types lands).
export type DeskTimelineEvent = {
  id: string;
  type: 'NOTE' | 'TASK' | 'CALL' | 'WHATSAPP';
  occurredAt: string;
  title: string;
  by: string;
  callStatus?: string | null;
  durationSeconds?: number | null;
};

export type DeskTimelineResponse =
  | { ok: true; events: DeskTimelineEvent[]; nextCursor: string | null }
  | DeskErrorResponse;

// waContext — WhatsApp session-window + reengagement-template state for one person.
export type DeskWaTemplate = {
  name: string;
  languageCode: string; // 'EN' | 'AR'
  metaLanguage: string; // exact Meta locale, e.g. en_US
  bodyText: string;
};

export type DeskWaContextResponse =
  | {
      ok: true;
      conversationId: string | null;
      withinWindow: boolean;
      lastInbound: string | null;
      templates: DeskWaTemplate[];
    }
  | DeskErrorResponse;

export type DeskWriteResponse =
  | ({ ok: true; touchedAt?: string; noteId?: string | null; taskId?: string; viewingId?: string; until?: string; auditWarning?: true })
  | DeskErrorResponse;

export type DeskGate = {
  type: 'field' | 'document' | 'activity' | 'approval';
  label: string;
  fix: string;
  taskId?: string | null;
  done?: boolean;
  approverLabel?: string | null;
};

export type DeskGateStatusResponse =
  | { ok: true; requirements: DeskGate[] }
  | DeskErrorResponse;

export type DeskNudgeResponse =
  | { ok: true; sent: number; skipped: number }
  | DeskErrorResponse;

export type DeskMoveResponse =
  | { ok: true; previousStage: string; touchedAt: string | null; noteId: string | null; sideEffects: string[] }
  | { ok: false; error: string; gate?: DeskGate };

export type DeskUndoResponse =
  | { ok: true; touchedAt: string; sideEffectsStay: string[] }
  | DeskErrorResponse;
