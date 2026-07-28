import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { RcbiComplianceGateService } from 'src/modules/propel-rls/rcbi-compliance-gate.service';

// RCBI compliance HARD-block — rcbiOpportunity.updateOne. Blocks a forward stage
// move PAST "Compliance check" while complianceStatus != Cleared (Nancy SOP §4/§8;
// FATF/PEP). Runs ALONGSIDE the §8.3 task stage-gate hook on the same operation —
// the hook registry holds a list per key and runs them all; either throwing rejects
// the update. Decision logic lives in RcbiComplianceGateService; the pure predicate
// in rcbi-compliance.util (a clean-room port of the app's rcbi-automation-core).
@WorkspaceQueryHook(`rcbiOpportunity.updateOne`)
export class RcbiOpportunityComplianceGatePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly rcbiComplianceGateService: RcbiComplianceGateService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs,
  ): Promise<UpdateOneResolverArgs> {
    const data = payload.data as Record<string, unknown> | undefined;

    const nextStage = data?.['stage'] as string | undefined;
    // A complianceStatus set in the SAME mutation wins over the stored value, so a
    // single "clear compliance + advance stage" update is allowed.
    const payloadCompliance = data?.['complianceStatus'] as string | undefined;

    await this.rcbiComplianceGateService.assertComplianceAllows(
      authContext,
      payload.id,
      nextStage,
      payloadCompliance,
    );

    return payload;
  }
}
