import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { composeFilter } from 'src/modules/propel-rls/build-tier-filter.util';
import { PROPEL_OWNER_FIELD } from 'src/modules/propel-rls/owner-field.convention';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Wildcard pre-hook for *.findMany. Twenty's hook storage explicitly supports
// `*.<method>` keys (see workspace-query-hook.storage.ts — wildcard instances
// are prepended to the per-key instance list). This single class scopes
// AGENT-tier reads across ALL objects in PROPEL_OWNER_FIELD with one
// implementation, replacing the per-object findMany hooks pattern.
//
// Composition with existing per-object hooks (e.g. ListingRlsPreQueryHook):
// the wildcard hook runs FIRST, then the per-object hook runs and AND-merges
// its own filter on top. Both compute the same predicate for the same
// (object, agent) tuple, so the AND of identical filters is idempotent —
// behavior is identical during the overlap window. Per-object hooks can be
// deleted in a follow-up cleanup branch once we've verified the wildcard in
// prod for a soak period.
//
// Objects NOT in PROPEL_OWNER_FIELD: no filter applied here. Relies on
// Twenty's native canReadObjectRecords + the role's objectPermissions for
// gating. Adding an object to the convention is the ONE place to make it
// RLS-scoped — no new hook files, no engine rebuild beyond the next
// convention-edit deploy.
@WorkspaceQueryHook(`*.findMany`)
export class GenericRlsFindManyPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(private readonly propelTierService: PropelTierService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: FindManyResolverArgs,
  ): Promise<FindManyResolverArgs> {
    const ownerField = PROPEL_OWNER_FIELD[objectName];

    // Object not in the convention → no propel-rls predicate here. Twenty's
    // native object permissions still apply at the resolver layer.
    if (!ownerField) return payload;

    const tierFilter = await this.propelTierService.buildTierFilter(
      authContext,
      { ownerField },
    );

    return {
      ...payload,
      filter: composeFilter(
        payload.filter,
        tierFilter,
      ) as FindManyResolverArgs['filter'],
    };
  }
}
