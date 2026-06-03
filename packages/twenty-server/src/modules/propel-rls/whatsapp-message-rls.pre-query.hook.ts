import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  buildTierFilter,
  composeFilter,
} from 'src/modules/propel-rls/build-tier-filter.util';

// Propel clean-room RLS — whatsAppMessage.findMany. owner + businessUnit are
// denormalized from the parent conversation, so the standard tier filter applies
// (defense-in-depth: a message can't be read by phone-number guessing the way the
// conversation can't).
@WorkspaceQueryHook(`whatsAppMessage.findMany`)
export class WhatsAppMessageRlsPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: FindManyResolverArgs,
  ): Promise<FindManyResolverArgs> {
    const tierFilter = buildTierFilter(authContext);

    return {
      ...payload,
      filter: composeFilter(
        payload.filter,
        tierFilter,
      ) as FindManyResolverArgs['filter'],
    };
  }
}
