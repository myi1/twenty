import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { type RawAuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import {
  PropelTierService,
  type PropelTier,
} from 'src/modules/propel-rls/propel-tier.service';

export type WorkerActorRefusal =
  | 'NOT_A_MEMBER_OF_THIS_WORKSPACE'
  | 'USER_NOT_FOUND'
  | 'NO_ACTIVE_LOGIN_IN_THIS_WORKSPACE'
  | 'NOT_A_MANAGER'
  | 'RESOLUTION_FAILED';

export interface WorkerActorVerdict {
  tier: PropelTier;
  reason: WorkerActorRefusal | null;
}

/**
 * Re-checks, AT THE MOMENT OF THE STEP, the manager a command-worker request
 * says it acts for (founder decision, 2026-09-13).
 *
 * The worker's key proves the WORKER. It proves nothing about the person. So the
 * member id it carries is treated as a claim and rebuilt the way a real sign-in
 * builds a user context (jwt.auth.strategy validateAccessToken):
 *   member   — from THIS workspace's member cache. Member ids repeat across
 *              workspaces in this engine, so a global lookup would be wrong.
 *   user     — from the core entity cache.
 *   login    — core."userWorkspace" for (user, THIS workspace), read from the
 *              DATABASE, soft-deleted rows excluded: a removed manager's queued
 *              command must not run.
 *   tier     — PropelTierService, the same resolver every RLS hook uses.
 *
 * Every miss and every thrown error fails CLOSED. Known limit, stated rather than
 * hidden: the role itself comes from the role cache, so a demotion made outside
 * Twenty's supported paths (a raw DB write) is invisible here until that cache is
 * invalidated — exactly as it is to the RLS hooks.
 */
@Injectable()
export class PropelCommandActorService {
  private readonly logger = new Logger(PropelCommandActorService.name);

  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly coreEntityCacheService: CoreEntityCacheService,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly propelTierService: PropelTierService,
  ) {}

  async resolveWorkerActor(
    workspace: NonNullable<RawAuthContext['workspace']>,
    workspaceMemberId: string,
  ): Promise<WorkerActorVerdict> {
    try {
      const { flatWorkspaceMemberMaps } =
        await this.workspaceCacheService.getOrRecompute(workspace.id, [
          'flatWorkspaceMemberMaps',
        ]);

      const workspaceMember = flatWorkspaceMemberMaps.byId[workspaceMemberId];

      if (!isDefined(workspaceMember)) {
        return { tier: 'AGENT', reason: 'NOT_A_MEMBER_OF_THIS_WORKSPACE' };
      }

      const user = await this.coreEntityCacheService.get(
        'user',
        workspaceMember.userId,
      );

      if (!isDefined(user)) {
        return { tier: 'AGENT', reason: 'USER_NOT_FOUND' };
      }

      const userWorkspace = await this.userWorkspaceRepository.findOne({
        where: { userId: workspaceMember.userId, workspaceId: workspace.id },
      });

      if (!isDefined(userWorkspace)) {
        return { tier: 'AGENT', reason: 'NO_ACTIVE_LOGIN_IN_THIS_WORKSPACE' };
      }

      const tier = await this.propelTierService.resolveTier(
        buildUserAuthContext({
          workspace,
          userWorkspaceId: userWorkspace.id,
          user,
          workspaceMemberId,
          workspaceMember,
        }),
      );

      return { tier, reason: tier === 'MANAGER' ? null : 'NOT_A_MANAGER' };
    } catch (error) {
      this.logger.warn(
        `Command worker actor resolution failed; refusing. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return { tier: 'AGENT', reason: 'RESOLUTION_FAILED' };
    }
  }
}
