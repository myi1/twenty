import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  AtomicCommandService,
  IdempotencyConflictError,
  StaleFenceError,
  StaleVersionError,
  UnknownAggregateError,
  type SpikeFailurePoint,
} from 'src/modules/propel-command/atomic-command.service';
import { PropelCommandActorService } from 'src/modules/propel-command/propel-command-actor.service';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

/**
 * C0 SPIKE boundary.
 *
 * Carries a DELIBERATE CRASH INJECTION POINT (`failAfter`) and must never be
 * reachable on a real environment: 404 unless PROPEL_C0_SPIKE_ENABLED=true, set
 * only in .env.test.
 *
 * WHO MAY ISSUE AN ASSIGNMENT STEP
 *  - A MANAGER, with their own session token. They act only as themselves.
 *  - The COMMAND WORKER, with its own API key, whose id must be listed in
 *    PROPEL_COMMAND_WORKER_API_KEY_IDS. It must name the manager it acts for, and
 *    that manager is re-checked NOW (PropelCommandActorService). No custom role:
 *    custom roles fail closed to AGENT on this engine.
 *  - Nobody else. Any other API key — even one holding the Admin role — and any
 *    application token is refused.
 * Identity is never taken from workspaceId/memberId in a payload.
 *
 * Refusals carry a contract `code`, so a worker can tell a stale version from an
 * idempotency conflict without parsing prose.
 */

const FAILURE_POINTS: SpikeFailurePoint[] = ['none', 'domain', 'receipt', 'commit'];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AssignmentStepBody {
  personId?: unknown;
  nextOwner?: unknown;
  operationId?: unknown;
  stepKey?: unknown;
  payloadHash?: unknown;
  failAfter?: unknown;
  useOrmWritePath?: unknown;
  expectedVersion?: unknown;
  fence?: unknown;
  onBehalfOfWorkspaceMemberId?: unknown;
  workspaceId?: unknown;
  memberId?: unknown;
}

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `${field} must be a non-empty string`,
    });
  }

  return value;
};

const workerKeyIds = (): Set<string> =>
  new Set(
    (process.env.PROPEL_COMMAND_WORKER_API_KEY_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

@Controller('propel/v1/spike')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
export class PropelCommandController {
  constructor(
    private readonly atomicCommandService: AtomicCommandService,
    private readonly propelTierService: PropelTierService,
    private readonly actorService: PropelCommandActorService,
  ) {}

  /** Returns the verified workspace id, or throws. */
  private async authorise(request: Request, onBehalfOf: unknown): Promise<string> {
    if (process.env.PROPEL_C0_SPIKE_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    if (!isDefined(request.workspace)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No verified workspace on this request.',
      });
    }

    if (isDefined(request.application)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Application tokens have no assignment policy.',
      });
    }

    // ── the command worker ──────────────────────────────────────────────────
    if (isDefined(request.apiKey)) {
      if (!workerKeyIds().has(request.apiKey.id)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'This API key is not authorised to issue assignment commands.',
        });
      }

      if (typeof onBehalfOf !== 'string' || !UUID.test(onBehalfOf)) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message:
            'The command worker must name the manager it acts for: onBehalfOfWorkspaceMemberId.',
        });
      }

      const verdict = await this.actorService.resolveWorkerActor(
        request.workspace,
        onBehalfOf,
      );

      if (verdict.tier !== 'MANAGER') {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: `The person this command acts for may not issue it: ${verdict.reason ?? 'NOT_A_MANAGER'}.`,
        });
      }

      return request.workspace.id;
    }

    // ── a person, acting as themselves ──────────────────────────────────────
    if (isDefined(onBehalfOf)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message:
          'A signed-in user acts only as themselves; onBehalfOfWorkspaceMemberId is reserved for the command worker.',
      });
    }

    if (
      !isDefined(request.userWorkspaceId) ||
      !isDefined(request.workspaceMemberId) ||
      !isDefined(request.workspaceMember) ||
      !isDefined(request.user)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No verified user on this request.',
      });
    }

    const tier = await this.propelTierService.resolveTier(
      buildUserAuthContext({
        workspace: request.workspace,
        userWorkspaceId: request.userWorkspaceId,
        user: request.user,
        workspaceMemberId: request.workspaceMemberId,
        workspaceMember: request.workspaceMember,
      }),
    );

    if (tier !== 'MANAGER') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Assignment is manager-only.',
      });
    }

    return request.workspace.id;
  }

  @Post('assignment-step')
  async assignmentStep(@Req() request: Request, @Body() body: AssignmentStepBody) {
    const workspaceId = await this.authorise(request, body.onBehalfOfWorkspaceMemberId);

    if (isDefined(body.workspaceId) || isDefined(body.memberId)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'workspaceId/memberId are derived from the access token and must not be sent.',
      });
    }

    const failAfter = (body.failAfter ?? 'none') as SpikeFailurePoint;

    if (!FAILURE_POINTS.includes(failAfter)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `failAfter must be one of ${FAILURE_POINTS.join('|')}`,
      });
    }

    const expectedVersion = String(body.expectedVersion ?? '0');

    if (!/^\d+$/.test(expectedVersion)) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'expectedVersion must be a non-negative decimal integer',
      });
    }

    const fence = Number(body.fence ?? 0);

    if (!Number.isInteger(fence) || fence < 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'fence must be a non-negative integer',
      });
    }

    try {
      return await this.atomicCommandService.commitAssignmentStep({
        workspaceId,
        personId: requireString(body.personId, 'personId'),
        nextOwner: requireString(body.nextOwner, 'nextOwner'),
        operationId: requireString(body.operationId, 'operationId'),
        stepKey: requireString(body.stepKey, 'stepKey'),
        payloadHash: requireString(body.payloadHash, 'payloadHash'),
        expectedVersion,
        fence,
        failAfter,
        useOrmWritePath: body.useOrmWritePath === true,
      });
    } catch (error) {
      // A conflict is not a server error: the caller can act on it. An injected
      // crash stays a 500 on purpose — the caller does not know whether the work
      // committed, which is what the step lookup below exists to answer.
      if (error instanceof StaleVersionError || error instanceof StaleFenceError) {
        throw new ConflictException({ code: 'STALE_VERSION', message: error.message });
      }

      if (error instanceof IdempotencyConflictError) {
        throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: error.message });
      }

      if (error instanceof UnknownAggregateError) {
        throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: error.message });
      }

      throw error;
    }
  }

  /**
   * Did this step commit? The worker's answer to an UNKNOWN outcome: ask, rather
   * than resend blind. Re-authorises on every read, exactly like a write.
   */
  @Get('steps/:operationId/:stepKey')
  async step(
    @Req() request: Request,
    @Param('operationId') operationId: string,
    @Param('stepKey') stepKey: string,
    @Query('onBehalfOfWorkspaceMemberId') onBehalfOf?: string,
  ) {
    const workspaceId = await this.authorise(request, onBehalfOf);

    if (!UUID.test(operationId)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'operationId must be a UUID',
      });
    }

    const found = await this.atomicCommandService.getStep(workspaceId, operationId, stepKey);

    if (!found) {
      throw new NotFoundException('No committed step with that key in this workspace.');
    }

    return found;
  }
}
