import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type GroupByResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { composeFilter } from 'src/modules/propel-rls/build-tier-filter.util';
import { PROPEL_OWNER_FIELD } from 'src/modules/propel-rls/owner-field.convention';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Wildcard pre-hook for *.groupBy. See generic-rls-find-many.pre-query.hook.ts
// for the design rationale.
@WorkspaceQueryHook(`*.groupBy`)
export class GenericRlsGroupByPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(private readonly propelTierService: PropelTierService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: GroupByResolverArgs,
  ): Promise<GroupByResolverArgs> {
    const ownerField = PROPEL_OWNER_FIELD[objectName];

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
      ) as GroupByResolverArgs['filter'],
    };
  }
}
