import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { isDefined } from 'twenty-shared/utils';

import { AtomicCommandService } from 'src/engine/core-modules/propel-command/atomic-command.service';
import {
  type CommandReceipt,
  CommandKind,
  type ExecuteCommandInput,
} from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import {
  PROPEL_ROLE_LABEL_TIER_MAP,
  PROPEL_ROLE_UID_TIER_MAP,
  type PropelTier,
} from 'src/modules/propel-rls/propel-tier.service';

export class ExecuteCommandDto implements ExecuteCommandInput {
  @IsString()
  @IsNotEmpty()
  commandId: string;

  @IsEnum(CommandKind)
  kind: CommandKind;

  @IsObject()
  payload: Record<string, unknown>;
}

// Engine entry point for a Propel command. The guards authenticate (and the
// JwtAuthGuard rejects anonymous callers) but they do NOT authorise: the role
// check below is explicit and fail-closed.
@Controller('propel-command')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class PropelCommandController {
  private readonly logger = new Logger(PropelCommandController.name);

  constructor(
    private readonly atomicCommandService: AtomicCommandService,
    private readonly roleService: RoleService,
    private readonly userRoleService: UserRoleService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async execute(
    @Body() command: ExecuteCommandDto,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<CommandReceipt> {
    const tier = await this.resolveCallerTier(workspace.id, userWorkspaceId);

    if (tier !== 'MANAGER') {
      throw new ForbiddenException(
        'Only a Propel manager may execute a command.',
      );
    }

    return this.atomicCommandService.execute(command);
  }

  // Mirrors PropelTierService's fail-closed resolution so this endpoint accepts
  // the same callers the RLS layer treats as MANAGER (Admin / Propel Manager)
  // and denies everyone else — including any lookup error.
  private async resolveCallerTier(
    workspaceId: string,
    userWorkspaceId: string,
  ): Promise<PropelTier> {
    try {
      const roleId = await this.userRoleService.getRoleIdForUserWorkspace({
        workspaceId,
        userWorkspaceId,
      });
      const role = await this.roleService.getRoleById(roleId, workspaceId);

      if (!isDefined(role)) {
        return 'AGENT';
      }

      if (
        role.universalIdentifier === STANDARD_ROLE.admin.universalIdentifier
      ) {
        return 'MANAGER';
      }

      const uidTier = isDefined(role.universalIdentifier)
        ? PROPEL_ROLE_UID_TIER_MAP[role.universalIdentifier]
        : undefined;

      if (isDefined(uidTier)) {
        return uidTier;
      }

      return PROPEL_ROLE_LABEL_TIER_MAP[role.label] ?? 'AGENT';
    } catch (error) {
      this.logger.warn(
        `Propel command tier resolution failed; denying. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return 'AGENT';
    }
  }
}
