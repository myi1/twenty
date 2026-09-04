// ── Propel RLS — owner-field convention table ───────────────────────────────
// Single source of truth for "this object is RLS-scoped, and its owner column
// is X." The generic-rls.*.pre-query.hook.ts files (wildcard hooks) consult
// this map to decide whether to apply the AGENT-tier `ownerField == me`
// predicate for any given object.
//
// FAIL-CLOSED FOR AGENT — an object NOT in this map is unconstrained at the
// propel-rls layer (relies on Twenty's native canReadObjectRecords for
// gating). Adding an object here makes AGENT tier see own-rows-only.
//
// Convention pairs:
//   - 14 CUSTOM CRM objects defined in the propel app (`owner` relation,
//     joinColumnName 'ownerId').
//   - Propel-app standard-object additions: `person.assignedAgent` (the
//     CRM's lead-routing owner) and any future ones added with the
//     `isRecordOwner` semantic.
//   - Twenty standard objects with a native workspaceMember relation:
//     task.assignee, timelineActivity.workspaceMember.
//
// NOTE — Company: deliberately NOT in this map. Founder decision
// (2026-06-30): "we don't use companies." Hidden globally via
// objectPermissions on Agent + Manager roles in the app manifest
// (`src/roles/*.role.ts`). Add it back here if Company ever gets used
// AND its accountOwnerId is backfilled across existing rows.
//
// See docs/RLS-CONFIG-SYSTEM-DESIGN.md v2.

export const PROPEL_OWNER_FIELD: Readonly<Record<string, string>> = Object.freeze(
  {
    // Custom CRM lane objects — all use `owner` relation → ownerId column
    secondaryOpportunity: 'ownerId',
    sellOpportunity: 'ownerId',
    offPlanOpportunity: 'ownerId',
    institutionalOpportunity: 'ownerId',
    rcbiOpportunity: 'ownerId',
    listing: 'ownerId',
    deal: 'ownerId',
    offer: 'ownerId',
    heldMoney: 'ownerId',
    chainLink: 'ownerId',
    offPlanMilestone: 'ownerId',
    portalSync: 'ownerId',
    trakheesiPermit: 'ownerId',

    // Call activity log — propel custom object, `owner` relation → ownerId.
    // Was OMITTED here, so agents saw EVERY agent's/manager's call log (bug
    // F-04, confirmed on prod 2026-09-04: agent read all 134 call records via
    // both findMany and findOne). Owner is populated by the voice-service
    // call-logger; a NULL owner scopes to no agent (manager-only), which is
    // the safe fail-state until backfill.
    call: 'ownerId',

    // Standard objects — propel-app field
    person: 'assignedAgentId',

    // Standard objects — Twenty-native owner columns
    task: 'assigneeId',
    timelineActivity: 'workspaceMemberId',
  },
);

// Keys list for module-wiring convenience (not strictly necessary but it
// surfaces the supported set in one greppable spot).
export const PROPEL_RLS_HOOKED_OBJECTS: readonly string[] = Object.freeze(
  Object.keys(PROPEL_OWNER_FIELD),
);
