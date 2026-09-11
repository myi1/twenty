import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { composeFilter } from 'src/modules/propel-rls/build-tier-filter.util';
import { PROPEL_OWNER_FIELD } from 'src/modules/propel-rls/owner-field.convention';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Wildcard pre-hook for *.updateMany — and the neat half of this fix.
//
// `updateMany` carries a filter, so the tier predicate composes into it exactly as it does
// for findMany: `AND ownerField == me`. No lookup, no extra query, and the scoping cannot
// be argued around, because a caller's own filter is AND-ed with ours rather than replaced.
// An agent's bulk update then matches only rows they own — including when they aimed it at
// somebody else's, which is the case that was demonstrated to work before this existed.
//
// This is deliberately the SAME helper (composeFilter) and the SAME predicate builder
// (PropelTierService.buildTierFilter) the read path uses. Two implementations of one rule
// is how the marketing publish gate ended up disagreeing with itself; one is the point.
@WorkspaceQueryHook(`*.updateMany`)
export class GenericRlsUpdateManyPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(private readonly propelTierService: PropelTierService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: UpdateManyResolverArgs,
  ): Promise<UpdateManyResolverArgs> {
    const ownerField = PROPEL_OWNER_FIELD[objectName];

    if (!ownerField) return payload;

    const tierFilter = await this.propelTierService.buildTierFilter(authContext, {
      ownerField,
    });

    return {
      ...payload,
      filter: composeFilter(
        payload.filter,
        tierFilter,
      ) as UpdateManyResolverArgs['filter'],
    };
  }
}
