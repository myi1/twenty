import { Injectable } from '@nestjs/common';
import { msg } from '@lingui/core/macro';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  isComplianceGateViolated,
  RCBI_COMPLIANCE_GATE_STAGE,
} from 'src/modules/propel-rls/rcbi-compliance.util';

// ── RCBI compliance HARD-block (Nancy's RCBI SOP §4/§8) ──────────────────────
// The app-side already (a) auto-sets complianceStatus=Pending on entry to QUALIFIED,
// (b) escalates to Asif (CEO/compliance authority) on ESCALATED, and (c) raises a
// reminder/guard task. What it CANNOT do is THROW to stop a write — only this
// server-fork pre-persist hook can. This service is that hard gate: it REJECTS a
// forward stage move PAST "Compliance check" while complianceStatus != Cleared.
//
// ⚠ DELIBERATELY NOT manager-bypassable. Unlike the §8.3 StageGateService (a
// "finish your task first" workflow nicety that PropelTierService.gateBypasses lets
// a MANAGER override), this is a regulatory FATF/PEP control. There is no role that
// may skip it: compliance is cleared by SETTING complianceStatus=Cleared (Asif's
// authority), never by who is doing the drag. So we bypass ONLY non-user contexts
// (system/apiKey/cron/app) — needed so the app-side automation that writes
// complianceStatus, and integrations, are not themselves blocked — and apply the
// gate to EVERY human user, manager and agent alike.
@Injectable()
export class RcbiComplianceGateService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  // Throws CommonQueryRunnerException to block; returns void to allow.
  //   nextStage          — the `stage` value in the update payload (undefined = no
  //                        stage change → never blocks).
  //   payloadCompliance  — a complianceStatus value present in the SAME update
  //                        payload, if any. The effective status is payload-over-
  //                        record (a single mutation that both clears compliance and
  //                        advances the stage is allowed — the after-value wins).
  async assertComplianceAllows(
    authContext: WorkspaceAuthContext,
    recordId: string,
    nextStage: string | undefined,
    payloadCompliance: string | undefined,
  ): Promise<void> {
    if (nextStage === undefined) return; // not a stage change → nothing to gate
    // Non-user contexts (system/apiKey/cron/app) are never gated — the app-side
    // automation must be free to write compliance/stage, and integrations are
    // trusted. Human users (manager AND agent) are ALL gated — see class note.
    if (authContext.type !== 'user') return;

    const workspaceId = authContext.workspace.id;
    const systemAuthContext = buildSystemAuthContext(workspaceId);

    const recordCompliance =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'rcbiOpportunity',
          { shouldBypassPermissionChecks: true },
        );

        const record = (await repo.findOne({
          where: { id: recordId },
        })) as (Record<string, unknown> & { id: string }) | null;

        return record?.['complianceStatus'] as string | undefined;
      }, systemAuthContext);

    // Effective status: a value being set in THIS update wins over the stored one.
    const effectiveCompliance = payloadCompliance ?? recordCompliance;

    if (!isComplianceGateViolated(nextStage, effectiveCompliance)) return;

    throw new CommonQueryRunnerException(
      `RCBI compliance gate: cannot advance past "${RCBI_COMPLIANCE_GATE_STAGE}" ` +
        `while complianceStatus is "${effectiveCompliance ?? 'PENDING'}" (must be Cleared).`,
      CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
      {
        userFriendlyMessage: msg`Compliance must be Cleared before this RCBI opportunity can move past the Compliance check stage. Clear the FATF/PEP / source-of-funds check (or escalate to compliance) first.`,
      },
    );
  }
}
