import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { type TierFilterOptions } from 'src/modules/propel-rls/build-tier-filter.util';

// ── Propel clean-room RLS — tier resolution from the Twenty ROLE ─────────────
// The tier is derived from the requesting user's Twenty role, NOT from the
// (removed) workspaceMember.propelTier custom field.
//
//   MANAGER → sees all rows + bypasses the §8.3 stage gate (override).
//   AGENT   → sees only own rows (ownerField == self) + subject to the gate.
//
// CITERRA is GONE: RCBI was merged into the normal pipelines, so there is no
// separate Citerra wall/role anymore.
//
// HOOK-TIME SAFE: the role is resolved via UserRoleService.getRoleIdForUserWorkspace
// (backed by workspaceCacheService.getOrRecompute) — the SAME request-time path the
// rest of Twenty's RLS uses. It does NOT touch getWorkspaceContext()/AsyncLocalStorage,
// which is unavailable inside a pre-query hook (that was the v1 bug).
//
// FAIL CLOSED: a real user context never resolves to MANAGER by accident. Only the
// standard Admin role (matched by its stable universalIdentifier) and the custom
// "Manager" role (matched by label) get MANAGER. Everything else — Agent, Member, an
// unknown role, no role assigned, or ANY thrown error — buckets to AGENT (own rows).

export type PropelTier = 'MANAGER' | 'AGENT';

// The custom-role LABELS below are load-bearing: the workspace's custom roles MUST be
// named exactly "Manager" / "Agent" for tier resolution to work. Renaming a role in
// Twenty settings without updating this map silently demotes everyone in it to AGENT
// (fail-closed). Admin is matched by its stable standard-role universalIdentifier, so
// it is rename-safe.
export const PROPEL_ROLE_LABEL_TIER_MAP: Record<string, PropelTier> = {
  Manager: 'MANAGER',
  Agent: 'AGENT',
  Member: 'AGENT',
};

@Injectable()
export class PropelTierService {
  private readonly logger = new Logger(PropelTierService.name);

  constructor(
    private readonly userRoleService: UserRoleService,
    private readonly roleService: RoleService,
  ) {}

  // Resolves the propel tier for an auth context. ALWAYS returns a concrete tier;
  // never throws. Non-user contexts are handled by the callers (they get the see-all
  // filter / gate bypass) — if one reaches here, we fail closed to AGENT.
  async resolveTier(authContext: WorkspaceAuthContext): Promise<PropelTier> {
    if (authContext.type !== 'user') {
      return 'AGENT';
    }

    try {
      const workspaceId = authContext.workspace.id;
      const userWorkspaceId = authContext.userWorkspaceId;

      // Throws PermissionsException when no role is assigned → caught below → AGENT.
      const roleId = await this.userRoleService.getRoleIdForUserWorkspace({
        workspaceId,
        userWorkspaceId,
      });

      const role = await this.roleService.getRoleById(roleId, workspaceId);

      if (!isDefined(role)) {
        return 'AGENT';
      }

      // Admin: match by the stable standard-role universalIdentifier (rename-safe).
      if (role.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier) {
        return 'MANAGER';
      }

      // Custom roles (Manager / Agent / Member): match by label, default AGENT.
      return PROPEL_ROLE_LABEL_TIER_MAP[role.label] ?? 'AGENT';
    } catch (error) {
      this.logger.warn(
        `Propel tier resolution failed; defaulting to AGENT. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return 'AGENT';
    }
  }

  // Per-tier row filter for the RLS read-path hooks.
  //   non-user context        → null (integrations unfiltered)
  //   MANAGER (Admin/Manager)  → null (sees all)
  //   AGENT (everything else)  → ownerField == requesting member (own rows)
  // `ownerField` defaults to 'ownerId'; the standard person object passes
  // 'assignedAgentId'. Fail-closed: resolveTier() yields AGENT on any problem, so a
  // user never gets the null (see-all) filter by accident.
  async buildTierFilter(
    authContext: WorkspaceAuthContext,
    options: TierFilterOptions = {},
  ): Promise<Record<string, unknown> | null> {
    if (authContext.type !== 'user') return null;

    const tier = await this.resolveTier(authContext);

    if (tier === 'MANAGER') return null;

    const hasOwner = options.hasOwner ?? true;

    if (!hasOwner) return null;

    const ownerField = options.ownerField ?? 'ownerId';
    const memberId = authContext.workspaceMemberId;

    if (!memberId) return null;

    return { [ownerField]: { eq: memberId } };
  }

  // §8.3 stage gate bypass: non-user contexts and MANAGER tier bypass (override).
  async gateBypasses(authContext: WorkspaceAuthContext): Promise<boolean> {
    if (authContext.type !== 'user') return true;

    return (await this.resolveTier(authContext)) === 'MANAGER';
  }
}
