import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';

import { AtomicCommandService } from 'src/engine/core-modules/propel-command/atomic-command.service';
import {
  type CommandReceipt,
  CommandKind,
} from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { DurableEffectService } from 'src/engine/core-modules/propel-command/durable-effect.service';
import { type EffectReceipt } from 'src/engine/core-modules/propel-command/effect-receipt.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

// The request body never carries a workspaceId: the workspace comes from the
// authenticated context, so a caller cannot address another workspace's receipt.
export class ExecuteCommandDto {
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
@Controller()
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class PropelCommandController {
  constructor(
    private readonly atomicCommandService: AtomicCommandService,
    private readonly durableEffectService: DurableEffectService,
    private readonly propelTierService: PropelTierService,
  ) {}

  @Post('propel-command')
  @HttpCode(HttpStatus.OK)
  async execute(
    @Body() command: ExecuteCommandDto,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<CommandReceipt> {
    await this.authorizeManager(workspace.id, userWorkspaceId);

    return this.atomicCommandService.execute({
      ...command,
      workspaceId: workspace.id,
    });
  }

  // Versioned, durable entry point. The step is claimed, executed, then
  // recorded; repeating the same commandId resumes a claimed-but-unfinished
  // step instead of applying its effect a second time.
  @Post('propel/v1/commands')
  @HttpCode(HttpStatus.OK)
  async executeDurable(
    @Body() command: ExecuteCommandDto,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<EffectReceipt> {
    await this.authorizeManager(workspace.id, userWorkspaceId);

    return this.durableEffectService.execute({
      ...command,
      workspaceId: workspace.id,
    });
  }

  // The guards only authenticate: they do not decide whether the caller may run
  // a command. The tier comes from the shared PropelTierService — the same
  // fail-closed resolution the RLS layer uses — so the two can never drift.
  private async authorizeManager(
    workspaceId: string,
    userWorkspaceId: string,
  ): Promise<void> {
    const tier = await this.propelTierService.resolveTierForUser({
      workspaceId,
      userWorkspaceId,
    });

    if (tier !== 'MANAGER') {
      throw new ForbiddenException(
        'Only a Propel manager may execute a command.',
      );
    }
  }
}
