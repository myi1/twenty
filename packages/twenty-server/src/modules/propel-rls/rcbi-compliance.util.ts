// ── RCBI compliance HARD-block — pure decision logic ─────────────────────────
// FATF/PEP source-of-funds gate (Nancy's RCBI SOP §4/§8): an rcbiOpportunity may
// NOT advance its stage PAST "Compliance check" while complianceStatus is anything
// other than CLEARED. PENDING and ESCALATED both BLOCK; CLEARED passes; DECLINED is
// routed to Lost (a DECLINED record should be moving to LOST, not forward — so it
// is also treated as non-blocking here: the block is specifically about un-cleared
// forward progress, and a DECLINED→forward move is separately nonsensical, but we
// do not THROW on it to avoid surprising a correction flow; CLEARED is the only
// "green light", everything that is PENDING/ESCALATED is a hard stop).
//
// ⚠ SOURCE-OF-TRUTH SYNC: these constants + predicates are a clean-room port of the
// APP-side shared core at
//   propel-crm-integration/src/shared/rcbi-automation-core.ts
// (functions isComplianceBlocking / isPastComplianceCheck / isComplianceGateViolated
//  and the RCBI_STAGE_ORDER array). The fork cannot import the app's src/**, so the
// logic is duplicated here verbatim. That app file's own comment names this fork
// hook as "the only layer that can actually THROW to block". If the RCBI stage SET
// or the compliance option values change in the app object definition, update BOTH.
//
// TODO(config-aware): the app stores operational RCBI values in the in-app
// `rcbiAutomationConfig` singleton (see rcbi-automation-core.ts mergeRcbiConfig +
// the founder "config over code" directive 2026-06-23). The compliance POLICY
// itself — which stage is the gate, which statuses clear it — is currently a fixed
// regulatory rule (FATF/PEP) and is hard-coded here per Nancy's SOP. If a future
// lead-system config exposes a compliance policy (e.g. a configurable gate stage or
// an allow-list of clearing statuses), read it in the service and pass the resolved
// values in instead of these constants. The pure predicates below already accept
// their inputs explicitly so that wiring is a service-layer change only.

// The RCBI active stage order, verbatim from the app object's `stage` SELECT
// (rcbi-opportunity.object.ts): NEW → CONTACTED → QUALIFIED → COMPLIANCE_CHECK →
// CONSULTATION → PARTNER_ENGAGED → APPLICATION → CONVERTED. ON_HOLD / LOST are
// terminal/side states and are intentionally NOT in this forward order.
export const RCBI_STAGE_ORDER = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'COMPLIANCE_CHECK',
  'CONSULTATION',
  'PARTNER_ENGAGED',
  'APPLICATION',
  'CONVERTED',
] as const;

// The compliance gate stage. A move to any stage strictly AFTER this one is gated.
export const RCBI_COMPLIANCE_GATE_STAGE = 'COMPLIANCE_CHECK';

// Statuses that BLOCK a forward move past the gate. Only CLEARED is a green light;
// DECLINED records should be heading to LOST (handled elsewhere) so they are not in
// this blocking set, but PENDING/ESCALATED are hard stops.
const COMPLIANCE_BLOCKING = new Set(['PENDING', 'ESCALATED']);

export const isComplianceBlocking = (
  complianceStatus: string | null | undefined,
): boolean => COMPLIANCE_BLOCKING.has((complianceStatus ?? '').toUpperCase());

const stageIndex = (stage: string | null | undefined): number =>
  (RCBI_STAGE_ORDER as readonly string[]).indexOf((stage ?? '').toUpperCase());

// Is `targetStage` strictly past the compliance gate in the active flow? A stage
// not in the ordered list (ON_HOLD / LOST / unknown) is NOT "past" — only clean
// forward stages count, so parking / abandoning is never blocked by compliance.
export const isPastComplianceCheck = (
  targetStage: string | null | undefined,
): boolean => {
  const i = stageIndex(targetStage);
  const gate = stageIndex(RCBI_COMPLIANCE_GATE_STAGE);

  if (i === -1 || gate === -1) return false;

  return i > gate;
};

// Should a forward move to `targetStage` be BLOCKED by the compliance gate, given
// the (effective) complianceStatus? True only when moving strictly past the gate
// stage while compliance is PENDING/ESCALATED. This is the single decision the
// server-fork hook throws on.
export const isComplianceGateViolated = (
  targetStage: string | null | undefined,
  complianceStatus: string | null | undefined,
): boolean =>
  isPastComplianceCheck(targetStage) && isComplianceBlocking(complianceStatus);
