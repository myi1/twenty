import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { msg } from '@lingui/core/macro';
import {
  PermissionFlagType,
  SystemPermissionFlag,
} from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/services/api-key-role.service';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import {
  ApplicationException,
  ApplicationExceptionCode,
} from 'src/engine/core-modules/application/application.exception';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { TOOL_PERMISSION_FLAGS } from 'src/engine/metadata-modules/permissions/constants/tool-permission-flags';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type UserWorkspacePermissions } from 'src/engine/metadata-modules/permissions/types/user-workspace-permissions';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

// Propel: the full set of hero permission flags (the PROPEL_* keys the front-end
// gates the hero nav / launchers on). Admins (canUpdateAllSettings) are granted
// all of these in propelEffectiveFlags so admin hero-access never depends on the
// role's (prunable) permission-flag rows. Keep in sync with the front-end
// route→flag map and the app-side PROPEL_FLAG_KEYS list.
const PROPEL_HERO_FLAG_KEYS = [
  'PROPEL_INBOX',
  'PROPEL_LISTING_STUDIO',
  'PROPEL_A2A_STUDIO',
  'PROPEL_ONE_ON_ONE_RUNNER',
  'PROPEL_MARKETING_HUB',
  'PROPEL_CAMPAIGN_BUILDER',
  'PROPEL_SEQUENCE_EDITOR',
  'PROPEL_SOCIAL_CALENDAR',
  'PROPEL_SETTINGS_HUB',
  'PROPEL_NUMBER_HUB',
];

@Injectable()
export class PermissionsService {
  constructor(
    private readonly userRoleService: UserRoleService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly apiKeyRoleService: ApiKeyRoleService,
    @InjectWorkspaceScopedRepository(RoleEntity)
    private readonly roleRepository: WorkspaceScopedRepository<RoleEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  private isToolPermission(feature: string) {
    return TOOL_PERMISSION_FLAGS.includes(feature);
  }

  public async getUserWorkspacePermissions({
    userWorkspaceId,
    workspaceId,
  }: {
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<UserWorkspacePermissions> {
    const [roleOfUserWorkspace] = await this.userRoleService
      .getRolesByUserWorkspaces({
        userWorkspaceIds: [userWorkspaceId],
        workspaceId,
      })
      .then((roles) => roles?.get(userWorkspaceId) ?? []);

    if (!isDefined(roleOfUserWorkspace)) {
      throw new PermissionsException(
        PermissionsExceptionMessage.NO_ROLE_FOUND_FOR_USER_WORKSPACE,
        PermissionsExceptionCode.NO_ROLE_FOUND_FOR_USER_WORKSPACE,
        {
          userFriendlyMessage: msg`Your role in this workspace could not be found. Please contact your workspace administrator.`,
        },
      );
    }

    const defaultSettingsPermissions =
      this.getDefaultUserWorkspacePermissions().permissionFlags;
    const permissionFlags = Object.values(PermissionFlagType).reduce(
      (acc, feature) => {
        const hasBasePermission = this.isToolPermission(feature)
          ? roleOfUserWorkspace.canAccessAllTools
          : roleOfUserWorkspace.canUpdateAllSettings;

        return {
          ...acc,
          [feature]:
            hasBasePermission ||
            this.roleHasPermissionFlag(roleOfUserWorkspace, feature),
        };
      },
      defaultSettingsPermissions,
    );

    const { rolesPermissions } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'rolesPermissions',
      ]);

    const objectsPermissions = rolesPermissions[roleOfUserWorkspace.id] ?? {};

    const propelEffectiveFlags = await this.computePropelEffectiveFlags({
      roleOfUserWorkspace,
      userWorkspaceId,
      workspaceId,
    });

    return {
      permissionFlags,
      objectsPermissions,
      propelEffectiveFlags,
    };
  }

  // Propel hero-gating (additive, never throws). The effective app-flag set is
  //   (role app-flag keys ∪ member.additionalFlags) \ member.excludedFlags
  // where "app-flag keys" are the role's permission-flag keys that are NOT part
  // of Twenty's core PermissionFlagType enum (i.e. the PROPEL_* keys). The core
  // enum flags stay entirely on the existing `permissionFlags` path.
  //
  // FAIL-SAFE: any error here resolves to [] (heroes hidden) — this runs inside
  // the currentUser query, so an exception would break the whole app.
  private async computePropelEffectiveFlags({
    roleOfUserWorkspace,
    userWorkspaceId,
    workspaceId,
  }: {
    roleOfUserWorkspace: RoleEntity;
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<string[]> {
    try {
      const coreKeys = new Set<string>(Object.values(PermissionFlagType));

      const roleAppFlags = (roleOfUserWorkspace.rolePermissionFlags ?? [])
        .map((rolePermissionFlag) => rolePermissionFlag.permissionFlag?.key)
        .filter(
          (key): key is string => isDefined(key) && !coreKeys.has(key),
        );

      const { additionalFlags, excludedFlags } =
        await this.getPropelMemberFlagOverrides({
          userWorkspaceId,
          workspaceId,
        });

      const effective = new Set<string>(roleAppFlags);

      // Admins (canUpdateAllSettings — held ONLY by the built-in Admin role) see
      // EVERY hero, independent of the role's permission-flag rows. This keeps
      // admin hero-access bulletproof: app:install may prune the PROPEL_* flags
      // that were attached to the (non-editable) Admin role out-of-manifest, and
      // admins still see every hero. New admins need zero per-member setup. The
      // per-role config screen governs Manager/Agent/Member; Admin is always-all.
      if (roleOfUserWorkspace.canUpdateAllSettings === true) {
        for (const flag of PROPEL_HERO_FLAG_KEYS) {
          effective.add(flag);
        }
      }

      for (const flag of additionalFlags) {
        effective.add(flag);
      }
      for (const flag of excludedFlags) {
        // exclude wins on conflict — matches the front hook + design doc.
        effective.delete(flag);
      }

      return [...effective];
    } catch {
      return [];
    }
  }

  // Reads the per-agent MULTI_SELECT overrides (additionalFlags / excludedFlags)
  // from the workspace's workspaceMember standard object. The workspaceMember
  // table keys on `userId` (NOT userWorkspaceId), so we first resolve the
  // userWorkspaceId → userId via the core userWorkspace repo, then query the
  // workspaceMember by userId (mirrors user-role.service.ts
  // ::getWorkspaceMembersAssignedToRole). The additionalFlags / excludedFlags
  // columns only exist when the propel app is installed; if it isn't (or the
  // query fails for any reason) we return empty arrays. The caller wraps this in
  // try/catch too — this is defense-in-depth.
  private async getPropelMemberFlagOverrides({
    userWorkspaceId,
    workspaceId,
  }: {
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<{ additionalFlags: string[]; excludedFlags: string[] }> {
    try {
      const userWorkspace = await this.userWorkspaceRepository.findOne({
        where: { id: userWorkspaceId },
      });
      const userId = userWorkspace?.userId;

      if (!isDefined(userId)) {
        return { additionalFlags: [], excludedFlags: [] };
      }

      const authContext = buildSystemAuthContext(workspaceId);

      const member = await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const workspaceMemberRepository =
            await this.globalWorkspaceOrmManager.getRepository<WorkspaceMemberWorkspaceEntity>(
              workspaceId,
              'workspaceMember',
              { shouldBypassPermissionChecks: true },
            );

          return workspaceMemberRepository.findOne({
            where: {
              // `userId` IS a real workspaceMember column; the loose cast only
              // bridges the entity-type gap for additionalFlags/excludedFlags
              // (propel-added columns not on the base entity type).
              userId,
            } as Record<string, unknown>,
          });
        },
        authContext,
      );

      const memberRecord = member as
        | {
            additionalFlags?: string[] | null;
            excludedFlags?: string[] | null;
          }
        | null
        | undefined;

      return {
        additionalFlags: memberRecord?.additionalFlags ?? [],
        excludedFlags: memberRecord?.excludedFlags ?? [],
      };
    } catch {
      return { additionalFlags: [], excludedFlags: [] };
    }
  }

  public getDefaultUserWorkspacePermissions = () =>
    ({
      permissionFlags: {
        [PermissionFlagType.API_KEYS_AND_WEBHOOKS]: false,
        [PermissionFlagType.WORKSPACE]: false,
        [PermissionFlagType.WORKSPACE_MEMBERS]: false,
        [PermissionFlagType.ROLES]: false,
        [PermissionFlagType.DATA_MODEL]: false,
        [PermissionFlagType.SECURITY]: false,
        [PermissionFlagType.WORKFLOWS]: false,
        [PermissionFlagType.APPLICATIONS]: false,
        [PermissionFlagType.LAYOUTS]: false,
        [PermissionFlagType.VIEWS]: false,
        [PermissionFlagType.BILLING]: false,
        [PermissionFlagType.AI_SETTINGS]: false,
        [PermissionFlagType.AI]: false,
        [PermissionFlagType.UPLOAD_FILE]: false,
        [PermissionFlagType.DOWNLOAD_FILE]: false,
        [PermissionFlagType.SEND_EMAIL_TOOL]: false,
        [PermissionFlagType.HTTP_REQUEST_TOOL]: false,
        [PermissionFlagType.CODE_INTERPRETER_TOOL]: false,
        [PermissionFlagType.IMPORT_CSV]: false,
        [PermissionFlagType.EXPORT_CSV]: false,
        [PermissionFlagType.CONNECTED_ACCOUNTS]: false,
        [PermissionFlagType.IMPERSONATE]: false,
        [PermissionFlagType.SSO_BYPASS]: false,
        [PermissionFlagType.PROFILE_INFORMATION]: false,
        [PermissionFlagType.MARKETPLACE_APPS]: false,
      },
      objectsPermissions: {},
      propelEffectiveFlags: [],
    }) as const satisfies UserWorkspacePermissions;

  public async userHasWorkspaceSettingPermission({
    userWorkspaceId,
    workspaceId,
    setting,
    apiKeyId,
    applicationId,
  }: {
    userWorkspaceId?: string;
    workspaceId: string;
    setting: PermissionFlagType;
    apiKeyId?: string;
    applicationId?: string;
  }): Promise<boolean> {
    if (isDefined(apiKeyId)) {
      const roleId = await this.apiKeyRoleService.getRoleIdForApiKeyId(
        apiKeyId,
        workspaceId,
      );

      const role = await this.roleRepository.findOne(workspaceId, {
        where: { id: roleId },
        relations: [
          'rolePermissionFlags',
          'rolePermissionFlags.permissionFlag',
        ],
      });

      if (!isDefined(role)) {
        throw new PermissionsException(
          PermissionsExceptionMessage.API_KEY_ROLE_NOT_FOUND,
          PermissionsExceptionCode.API_KEY_ROLE_NOT_FOUND,
          {
            userFriendlyMessage: msg`The API key does not have a valid role assigned. Please check your API key configuration.`,
          },
        );
      }

      return this.checkRolePermissions(role, setting);
    }

    if (userWorkspaceId) {
      const [roleOfUserWorkspace] = await this.userRoleService
        .getRolesByUserWorkspaces({
          userWorkspaceIds: [userWorkspaceId],
          workspaceId,
        })
        .then((roles) => roles?.get(userWorkspaceId) ?? []);

      if (!isDefined(roleOfUserWorkspace)) {
        throw new PermissionsException(
          PermissionsExceptionMessage.NO_ROLE_FOUND_FOR_USER_WORKSPACE,
          PermissionsExceptionCode.NO_ROLE_FOUND_FOR_USER_WORKSPACE,
          {
            userFriendlyMessage: msg`Your role in this workspace could not be found. Please contact your workspace administrator.`,
          },
        );
      }

      return this.checkRolePermissions(roleOfUserWorkspace, setting);
    }

    if (applicationId) {
      const application = await this.applicationRepository.findOne({
        where: { id: applicationId, workspaceId },
      });

      if (!isDefined(application) || !isDefined(application.defaultRoleId)) {
        throw new ApplicationException(
          `Could not find application ${applicationId}`,
          ApplicationExceptionCode.APPLICATION_NOT_FOUND,
        );
      }

      const applicationRoleId = application.defaultRoleId;

      const role = await this.roleRepository.findOne(workspaceId, {
        where: { id: applicationRoleId },
        relations: [
          'rolePermissionFlags',
          'rolePermissionFlags.permissionFlag',
        ],
      });

      if (!isDefined(role)) {
        throw new PermissionsException(
          PermissionsExceptionMessage.APPLICATION_ROLE_NOT_FOUND,
          PermissionsExceptionCode.APPLICATION_ROLE_NOT_FOUND,
          {
            userFriendlyMessage: msg`The application does not have a valid role assigned. Please check your application configuration.`,
          },
        );
      }

      return this.checkRolePermissions(role, setting);
    }

    throw new PermissionsException(
      PermissionsExceptionMessage.NO_AUTHENTICATION_CONTEXT,
      PermissionsExceptionCode.NO_AUTHENTICATION_CONTEXT,
      {
        userFriendlyMessage: msg`Authentication is required to access this feature. Please sign in and try again.`,
      },
    );
  }

  public checkRolePermissions(
    role: RoleEntity,
    setting: PermissionFlagType,
  ): boolean {
    const hasBasePermission = this.isToolPermission(setting)
      ? role.canAccessAllTools
      : role.canUpdateAllSettings;

    if (hasBasePermission === true) {
      return true;
    }

    return this.roleHasPermissionFlag(role, setting);
  }

  private roleHasPermissionFlag(
    role: RoleEntity,
    flag: PermissionFlagType,
  ): boolean {
    const rolePermissionFlags = role.rolePermissionFlags ?? [];

    const permissionFlagUniversalIdentifier = SystemPermissionFlag[flag];

    return rolePermissionFlags.some(
      (rolePermissionFlag) =>
        rolePermissionFlag.permissionFlag.universalIdentifier ===
        permissionFlagUniversalIdentifier,
    );
  }

  private async getRolesFromPermissionConfig(
    rolePermissionConfig: RolePermissionConfig,
    workspaceId: string,
    relations: string[] = [],
  ): Promise<{ roles: RoleEntity[]; useIntersection: boolean } | null> {
    if ('shouldBypassPermissionChecks' in rolePermissionConfig) {
      return null;
    }

    let roleIds: string[] = [];
    let useIntersection = false;

    if ('intersectionOf' in rolePermissionConfig) {
      roleIds = rolePermissionConfig.intersectionOf;
      useIntersection = true;
    } else if ('unionOf' in rolePermissionConfig) {
      roleIds = rolePermissionConfig.unionOf;
      useIntersection = false;
    }

    if (roleIds.length === 0) {
      throw new Error('No role IDs provided');
    }

    const roles = await this.roleRepository.find(workspaceId, {
      where: { id: In(roleIds) },
      relations,
    });

    if (roles.length !== roleIds.length) {
      throw new Error('Some roles not found');
    }

    return { roles, useIntersection };
  }

  public async checkRolesPermissions(
    rolePermissionConfig: RolePermissionConfig,
    workspaceId: string,
    setting: PermissionFlagType,
  ): Promise<boolean> {
    try {
      const result = await this.getRolesFromPermissionConfig(
        rolePermissionConfig,
        workspaceId,
        ['rolePermissionFlags', 'rolePermissionFlags.permissionFlag'],
      );

      if (result === null) {
        return true;
      }

      const { roles, useIntersection } = result;

      return useIntersection
        ? roles.every((role) => this.checkRolePermissions(role, setting))
        : roles.some((role) => this.checkRolePermissions(role, setting));
    } catch {
      return false;
    }
  }

  public async hasToolPermission(
    rolePermissionConfig: RolePermissionConfig,
    workspaceId: string,
    flag: PermissionFlagType,
  ): Promise<boolean> {
    try {
      const result = await this.getRolesFromPermissionConfig(
        rolePermissionConfig,
        workspaceId,
        ['rolePermissionFlags', 'rolePermissionFlags.permissionFlag'],
      );

      if (result === null) {
        return true;
      }

      const { roles, useIntersection } = result;

      const checkRoleHasPermission = (role: RoleEntity) => {
        if (role.canAccessAllTools === true) {
          return true;
        }

        return this.roleHasPermissionFlag(role, flag);
      };

      return useIntersection
        ? roles.every(checkRoleHasPermission)
        : roles.some(checkRoleHasPermission);
    } catch {
      return false;
    }
  }
}
