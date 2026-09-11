import { Injectable } from '@nestjs/common';
import { msg } from '@lingui/core/macro';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { PROPEL_OWNER_FIELD } from 'src/modules/propel-rls/owner-field.convention';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// ── Propel RLS — the WRITE half ──────────────────────────────────────────────
//
// Until now this module scoped READS and nothing else. That was demonstrated, not
// theorised: on staging, 2026-09-12, with synthetic fixtures, agent A could not read
// agent B's lead by id, could not list it, and could not even see it in a count — and
// then changed it twice, with `updateOne` and `updateMany`, both confirmed in Postgres.
//
//   agentA findOne    agentB's lead   NOT_FOUND
//   agentA findMany   agentB's lead   0 rows
//   agentA totalCount all people      counted 4 of 3,161
//   agentA updateOne  agentB's lead   ROW CHANGED
//   agentA updateMany agentB's lead   ROW CHANGED
//
// An agent could not read a record they could overwrite.
//
// WHY it was possible: two facts, each harmless alone. Twenty grants the Agent role
// `canUpdateAllObjectRecords = true`, and this module registered `*.findMany`,
// `*.findOne`, `*.groupBy` plus seven per-lane `updateOne` STAGE gates — which police
// stage transitions, not ownership. The read hooks compensated for `readAll`. Nothing
// compensated for `updateAll`.
//
// SYMMETRY IS THE WHOLE DESIGN. This service answers the write question with exactly the
// inputs the read side uses: the same PROPEL_OWNER_FIELD convention, the same
// PropelTierService, the same MANAGER and non-user bypass. An object that is read-scoped
// becomes write-scoped; an object that is not in the convention is untouched here, and
// still relies on Twenty's native object permissions, as its reads do.
//
// WHY A REFUSAL LOOKS LIKE "NOT FOUND": because that is precisely what the read side
// already returns. An agent who cannot read a record now cannot write it AND receives the
// same answer either way, so the error cannot be used to probe whether a record exists or
// who owns it. RECORD_NOT_FOUND is not a euphemism here; for this caller the record
// genuinely is not addressable.
//
// WHAT THIS DELIBERATELY DOES NOT DO — and the plan asks for it, so the gap is explicit:
// F2's brief says to check "current ROOT assignment, not a stale child owner". This
// checks the record's OWN owner column, the same one the read side filters on. Resolving
// a child to its root (a lane opportunity to its person, say) needs the versioned
// assignment model that W03/W04 build; doing it here would make writes stricter than
// reads in a way nobody could see coming, and would break deliberate delegation, where a
// child is intentionally owned by someone other than the lead's agent. Closing the
// proven hole symmetrically is the honest scope for R1. The root-assignment check belongs
// with the assignment command, and the plan says as much: "Do not claim full command
// exclusivity at R1."

@Injectable()
export class PropelWritePolicyService {
  constructor(
    private readonly propelTierService: PropelTierService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  /**
   * Refuse an update to a record this caller does not own.
   *
   * Returns silently — meaning "not our business" — when:
   *   · the object is not in PROPEL_OWNER_FIELD (unscoped for reads too)
   *   · the caller is a non-user context or MANAGER tier (same bypass as reads)
   *   · the record does not exist (let the resolver answer; do not pre-empt it)
   */
  async assertMayUpdateRecord(
    authContext: WorkspaceAuthContext,
    objectName: string,
    recordId: string,
  ): Promise<void> {
    const ownerField = PROPEL_OWNER_FIELD[objectName];

    if (!ownerField) return;
    if (!recordId) return;

    // Narrow the union BEFORE touching workspaceMemberId: WorkspaceAuthContext also
    // covers API-key and system contexts, which carry no member at all. This is the same
    // first line PropelTierService.buildTierFilter uses, and it is not merely a compiler
    // nicety — integrations legitimately write across owners and must pass through here
    // untouched, exactly as they pass through the read filter untouched.
    if (authContext.type !== 'user') return;

    if (await this.propelTierService.gateBypasses(authContext)) return;

    const memberId = authContext.workspaceMemberId;

    // A user context with no workspace member cannot own anything, so it cannot pass an
    // ownership check. Fail closed rather than comparing against undefined — an
    // `undefined === undefined` would hand this caller every unowned record.
    if (!memberId) throw this.refuse();

    const workspaceId = authContext.workspace.id;

    const ownerId = await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          objectName,
          { shouldBypassPermissionChecks: true },
        );

        const record = (await repo.findOne({
          where: { id: recordId },
        })) as (Record<string, unknown> & { id: string }) | null;

        // `null` and "owned by nobody" are different answers and must stay different:
        // a missing record is not this hook's business, an unowned one is.
        return record ? ((record[ownerField] as string | null) ?? null) : undefined;
      },
    );

    if (ownerId === undefined) return;

    // An unassigned record (ownerId null) is NOT writable by an agent, because it is not
    // READABLE by one either — the read filter is `ownerField == me`, which null never
    // satisfies. Pool leads are claimed through the assignment route, not by editing them.
    if (ownerId !== memberId) throw this.refuse();
  }

  private refuse(): CommonQueryRunnerException {
    return new CommonQueryRunnerException(
      'Record not found',
      CommonQueryRunnerExceptionCode.RECORD_NOT_FOUND,
      {
        userFriendlyMessage: msg`This record is not available to you.`,
      },
    );
  }
}
