import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { composeFilter } from 'src/modules/propel-rls/build-tier-filter.util';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// Propel clean-room RLS — person.findMany. Scopes the book of business: lists,
// search, kanban, and relation PICKERS show an agent only their assigned contacts.
//
// Person's owning-agent column is `assignedAgentId` (not `ownerId`), and the
// standard person object has no businessUnit — hence the option overrides.
//
// NOTE: person.findOne is intentionally NOT scoped (yet). MANY_TO_ONE relations to
// person (opportunity.contact, whatsAppConversation.contact, …) are common across
// owners, and scoping findOne risks blanking the linked-contact display on records
// the agent legitimately owns. findMany + groupBy cover the actual exposure
// (whole-book lists/search/pickers); revisit findOne after validating relation reads.
@WorkspaceQueryHook(`person.findMany`)
export class PersonRlsPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly propelTierService: PropelTierService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: FindManyResolverArgs,
  ): Promise<FindManyResolverArgs> {
    const tierFilter = await this.propelTierService.buildTierFilter(authContext, {
      ownerField: 'assignedAgentId',
      hasBusinessUnit: false,
    });

    return {
      ...payload,
      filter: composeFilter(
        payload.filter,
        tierFilter,
      ) as FindManyResolverArgs['filter'],
    };
  }
}
