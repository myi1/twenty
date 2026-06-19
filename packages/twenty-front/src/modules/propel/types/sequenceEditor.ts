// Local TypeScript contracts for the graduated Sequence Editor hero (P3 hero #4 —
// the multi-step drip / nurture sequence builder).
//
// These mirror ONLY the slice of the Propel serverless payloads this hero touches.
// The canonical shapes live in the OTHER repo (propel-crm-integration:
// src/shared/marketing-hub-types.ts + src/shared/sequence-state.ts + the
// src/logic-functions/marketing-sequence-*-route.ts files). We deliberately do NOT
// import across repos — this is the fork-local copy of exactly what the editor
// reads/writes, nothing more.
//
// Every server payload follows the strict "never show data you don't have"
// contract (docs/MARKETING-CLOUD.md): the UI renders only present fields and NEVER
// zero-fills. Enrollment counts come straight from the route (real totalCount) —
// they are shown verbatim, never fabricated, and a brand-new draft simply shows 0
// because the route really did return 0.

export type SequenceStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'ARCHIVED';
export type EntryType = 'SEGMENT_POLL' | 'MANUAL' | 'EVENT';
export type StepType =
  | 'SEND_EMAIL'
  | 'SEND_WHATSAPP'
  | 'WAIT'
  | 'CONDITION'
  | 'CREATE_TASK'
  | 'EXIT';
export type ConditionKind = 'REPLIED' | 'OPENED' | 'CLICKED';
export type StepChannel = 'EMAIL' | 'WHATSAPP' | null;
export type TemplateLanguage = 'EN' | 'AR';

// One editable step as the editor round-trips it. yes/no branches reference SIBLING
// steps BY INDEX in the array — the save route resolves indices → ids after
// creating the steps (ids change on every wholesale steps replacement). This is the
// EXACT wire contract of /marketing/save-sequence; do not change it.
export interface SequenceStepDraft {
  name: string;
  stepType: StepType;
  channel: StepChannel;
  waitDays: number | null;
  templateSubject: string | null;
  templateBody: string | null;
  conditionKind: ConditionKind | null;
  whatsappTemplateId: string | null;
  whatsappLanguageCode: TemplateLanguage | null;
  yesStepIndex: number | null;
  noStepIndex: number | null;
}

export interface SequenceRow {
  id: string;
  name: string;
  status: SequenceStatus;
  entryType: EntryType;
  entrySegmentId: string | null;
  activeVersion: number;
  enrolledCount: number;
  activeCount: number;
  /** Steps of the active version — prefills the editor (editable in DRAFT/PAUSED). */
  steps: SequenceStepDraft[];
}

// ── /marketing/hub picker slices the editor consumes ─────────────────────────
export interface SegmentOption {
  id: string;
  name: string;
  lastResolvedCount: number;
  lastResolvedLabel: string;
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

// Only the slice of the hub payload the Sequence Editor reads. The full payload
// also carries boards/results/templates the editor never touches — those stay
// absent here so the type tells the truth about what this hero uses.
export interface SequenceHubPayload {
  tier?: string;
  segments?: SegmentOption[];
  waTemplates?: WaTemplateOption[];
  sequences?: SequenceRow[];
}

// ── Typed error envelope (marketing-io.envelope) ─────────────────────────────
// Every route returns either an `ok` payload OR an envelope carrying
// error/code/operatorAction. The UI surfaces operatorAction (plain coordinator
// language) when present, else error, never a raw stack.
export interface RouteEnvelopeError {
  error?: string;
  code?: string;
  operatorAction?: string;
}

// ── /marketing/save-sequence ─────────────────────────────────────────────────
export interface SaveSequenceResponse extends RouteEnvelopeError {
  ok?: boolean;
  sequenceId?: string;
  status?: SequenceStatus;
}

// ── /marketing/activate-sequence ─────────────────────────────────────────────
export type SequenceAction = 'activate' | 'pause' | 'archive' | 'stop_everyone';

export interface ActivateSequenceResponse extends RouteEnvelopeError {
  ok?: boolean;
  sequenceId?: string;
  status?: SequenceStatus;
  version?: number;
  exitedEnrollments?: number;
  errors?: string[];
}

// ── /marketing/sequence-test-send ────────────────────────────────────────────
export interface SequenceTestSendResponse extends RouteEnvelopeError {
  ok?: boolean;
  testSend?: {
    to: string;
    toName?: string;
    subject?: string;
    body?: string;
    channel?: string;
    stepId?: string;
    stepName?: string;
    espError?: string;
  };
}

// ── /marketing/sequence-enrollments (S4 — read surface) ──────────────────────
// Who is enrolled in a RUNNING/PAUSED sequence, at which step, what's next, and
// whether they're stuck. The data all lives on the `sequenceEnrollment` object
// (status, currentStep, nextActionAt, stepEnteredAt, capRetries + the person
// relation), but NO route currently exposes the per-enrollment ROWS — the
// /marketing/hub route only returns aggregate enrolledCount/activeCount totals.
// S4 therefore defines the UI against this typed shape and reads from a thin
// route that must be added server-side. See TODO(S4-backend) in EnrollmentList.
//
// enrollment status mirrors the object enum: ACTIVE · DONE · EXITED_REPLY ·
// EXITED_OPTOUT · EXITED_MANUAL · EXITED_COLD · EXITED_THROTTLED · BLOCKED_CONFIG.
export type EnrollmentStatus =
  | 'ACTIVE'
  | 'DONE'
  | 'EXITED_REPLY'
  | 'EXITED_OPTOUT'
  | 'EXITED_MANUAL'
  | 'EXITED_COLD'
  | 'EXITED_THROTTLED'
  | 'BLOCKED_CONFIG';

export interface EnrollmentRow {
  id: string;
  status: EnrollmentStatus;
  // Person identity for the row + a deep-link to the record. name may be blank
  // (phone-only lead) — the UI falls back to the id then.
  personId: string | null;
  personName: string;
  // The current step's human label + 1-based position, when the enrollment is
  // sitting on a step (absent once it has DONE/EXITED).
  currentStepName: string | null;
  currentStepOrder: number | null;
  // ISO instants. nextActionAt drives the "next: …" / "overdue" read; absent for
  // terminal enrollments. stepEnteredAt anchors the "waiting since" read.
  nextActionAt: string | null;
  stepEnteredAt: string | null;
  // How many times a SEND step was held by the weekly cap. > 0 = stuck-on-cap
  // (the object exits at 3 → EXITED_THROTTLED), surfaced as the "stuck" flag.
  capRetries: number;
}

export interface SequenceEnrollmentsResponse extends RouteEnvelopeError {
  ok?: boolean;
  enrollments?: EnrollmentRow[];
  // True aggregate counts (the route may page the rows); the panel shows these
  // even when the row list is capped, so the header total stays honest.
  activeCount?: number;
  enrolledCount?: number;
}
