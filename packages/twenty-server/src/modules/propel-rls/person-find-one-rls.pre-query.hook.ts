import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type FindOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { composeFilter } from 'src/modules/propel-rls/build-tier-filter.util';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Propel clean-room RLS — person.findOne. Owner field is `assignedAgentId`.
@WorkspaceQueryHook(`person.findOne`)
export class PersonFindOneRlsPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly propelTierService: PropelTierService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: FindOneResolverArgs,
  ): Promise<FindOneResolverArgs> {
    const tierFilter = await this.propelTierService.buildTierFilter(authContext, {
      ownerField: 'assignedAgentId',
    });

    return {
      ...payload,
      filter: composeFilter(payload.filter, tierFilter) as FindOneResolverArgs['filter'],
    };
  }
}
