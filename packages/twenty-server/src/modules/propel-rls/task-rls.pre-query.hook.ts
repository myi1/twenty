import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { composeFilter } from 'src/modules/propel-rls/build-tier-filter.util';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Propel clean-room RLS — task.findMany. Owner field is `assigneeId`
// (standard Twenty task.assignee → workspaceMember).
@WorkspaceQueryHook(`task.findMany`)
export class TaskRlsPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly propelTierService: PropelTierService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: FindManyResolverArgs,
  ): Promise<FindManyResolverArgs> {
    const tierFilter = await this.propelTierService.buildTierFilter(authContext, {
      ownerField: 'assigneeId',
    });

    return {
      ...payload,
      filter: composeFilter(payload.filter, tierFilter) as FindManyResolverArgs['filter'],
    };
  }
}
