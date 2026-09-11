import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PropelWritePolicyService } from 'src/modules/propel-rls/propel-write-policy.service';

// Wildcard pre-hook for *.updateOne — the mirror of GenericRlsFindManyPreQueryHook.
//
// `updateOne` carries `{ id, data }` and no filter, so there is nothing to compose a
// predicate into: the record has to be looked up and its owner compared. That read costs
// one indexed primary-key lookup per update, and only for AGENT-tier callers on objects
// in PROPEL_OWNER_FIELD — managers, system contexts and unscoped objects return before it.
//
// COMPOSITION with the seven existing per-lane `<lane>.updateOne` stage gates: Twenty's
// hook storage prepends wildcard instances to the per-key list, so this runs FIRST and the
// lane gate runs after. Both may reject and neither weakens the other — the module's own
// comment on the RCBI compliance gate says it plainly: "both run, either can reject".
// Ownership is checked before stage rules, which is the right order: a caller who may not
// touch the record at all should not receive a message about its stage tasks.
@WorkspaceQueryHook(`*.updateOne`)
export class GenericRlsUpdateOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(private readonly writePolicy: PropelWritePolicyService) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: UpdateOneResolverArgs,
  ): Promise<UpdateOneResolverArgs> {
    await this.writePolicy.assertMayUpdateRecord(
      authContext,
      objectName,
      payload.id,
    );

    return payload;
  }
}
