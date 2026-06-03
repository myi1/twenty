// ── Propel clean-room RLS — shared filter helpers ────────────────────────────
// The per-tier ROW FILTER now lives in PropelTierService.buildTierFilter (it must
// resolve the user's Twenty role at request time, which needs DI). This file keeps
// the DI-free pieces every per-object pre-query hook still shares: the options type
// and composeFilter.
//
//   MANAGER → null (no filter, sees all)
//   AGENT   → ownerField == requesting member  (sees own; ownerField default 'ownerId')
//   non-user contexts (apiKey/application/system) → null (integrations unfiltered)
//
// CITERRA / businessUnit isolation has been removed (RCBI merged into the normal
// pipelines). `hasBusinessUnit` is retained on the options type only so existing
// hook call sites keep compiling; it is ignored.

export type TierFilterOptions = {
  hasOwner?: boolean; // object carries an owner column (default true)
  // Deprecated/ignored: businessUnit (CITERRA) isolation was removed.
  hasBusinessUnit?: boolean;
  // Column the AGENT tier filters on (default 'ownerId'). The standard `person`
  // object names its owning-agent column `assignedAgentId` (the `isolationFields`
  // objects use `ownerId`), so person hooks pass `ownerField: 'assignedAgentId'`.
  ownerField?: string;
};

// Compose the tier filter with any user-supplied filter via AND so scoping can't
// be bypassed. Returns the new payload filter (or the original if no scoping).
export const composeFilter = (
  existing: unknown,
  tierFilter: Record<string, unknown> | null,
): unknown => {
  if (!tierFilter) return existing;

  return existing ? { and: [existing, tierFilter] } : tierFilter;
};

// NOTE on findDuplicates: it is NOT RLS-hooked. It cannot be scoped via a
// @WorkspaceQueryHook (its args are {ids, data} with no filter, and the post-query
// hook returns void). findDuplicates is INERT for our custom objects: it only queries
// when `flatObjectMetadata.duplicateCriteria` is non-empty, and (a) our objects
// define none and (b) the app SDK's ObjectManifest has no way to set duplicateCriteria.
// So there is no reachable leak to scope. If Twenty ever lets the SDK set
// duplicateCriteria on custom objects, revisit: fold the tier filter into
// duplicateConditions via { and: [...] } for the RLS-scoped objects only.
