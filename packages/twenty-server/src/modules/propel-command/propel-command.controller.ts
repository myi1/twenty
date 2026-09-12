import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  AtomicCommandService,
  InjectedSpikeFailure,
  type SpikeFailurePoint,
  type SpikeWriteMode,
} from 'src/modules/propel-command/atomic-command.service';

/**
 * C0 SPIKE boundary.
 *
 * This controller carries a DELIBERATE CRASH INJECTION POINT (`failAfter`) and
 * must never be reachable on a real environment. It is therefore 404 unless
 * PROPEL_C0_SPIKE_ENABLED is set, which is set only in .env.test. The flag is
 * read here rather than through TwentyConfigService on purpose: a spike must not
 * add a key to the validated config surface that a later reader mistakes for a
 * supported feature.
 *
 * The identity property under test: workspaceId comes from the verified bearer
 * token via JwtAuthGuard -> request.workspace. A workspace id in the request body
 * is rejected outright, not merely ignored.
 */

const FAILURE_POINTS: SpikeFailurePoint[] = ['none', 'domain', 'receipt'];
const WRITE_MODES: SpikeWriteMode[] = ['orm', 'runner'];

interface AssignmentStepBody {
  personId?: unknown;
  nextOwner?: unknown;
  operationId?: unknown;
  stepKey?: unknown;
  payloadHash?: unknown;
  assignmentVersion?: unknown;
  failAfter?: unknown;
  writeMode?: unknown;
  workspaceId?: unknown;
  memberId?: unknown;
}

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }

  return value;
};

@Controller('propel/v1/spike')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
export class PropelCommandController {
  constructor(private readonly atomicCommandService: AtomicCommandService) {}

  @Post('assignment-step')
  async assignmentStep(@Req() request: Request, @Body() body: AssignmentStepBody) {
    if (process.env.PROPEL_C0_SPIKE_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    if (!isDefined(request.workspace)) {
      throw new ForbiddenException('No verified workspace on this request.');
    }

    // Identity is never taken from the payload. Sending it is a client bug worth
    // failing loudly on, not something to silently drop.
    if (isDefined(body.workspaceId) || isDefined(body.memberId)) {
      throw new BadRequestException(
        'workspaceId/memberId are derived from the access token and must not be sent.',
      );
    }

    const failAfter = (body.failAfter ?? 'none') as SpikeFailurePoint;

    if (!FAILURE_POINTS.includes(failAfter)) {
      throw new BadRequestException(`failAfter must be one of ${FAILURE_POINTS.join('|')}`);
    }

    const writeMode = (body.writeMode ?? 'runner') as SpikeWriteMode;

    if (!WRITE_MODES.includes(writeMode)) {
      throw new BadRequestException(`writeMode must be one of ${WRITE_MODES.join('|')}`);
    }

    const assignmentVersion = Number(body.assignmentVersion ?? 1);

    if (!Number.isInteger(assignmentVersion) || assignmentVersion < 0) {
      throw new BadRequestException('assignmentVersion must be a non-negative integer');
    }

    try {
      return await this.atomicCommandService.commitAssignmentStep({
        workspaceId: request.workspace.id,
        personId: requireString(body.personId, 'personId'),
        nextOwner: requireString(body.nextOwner, 'nextOwner'),
        operationId: requireString(body.operationId, 'operationId'),
        stepKey: requireString(body.stepKey, 'stepKey'),
        payloadHash: requireString(body.payloadHash, 'payloadHash'),
        assignmentVersion,
        failAfter,
        writeMode,
      });
    } catch (error) {
      if (error instanceof InjectedSpikeFailure) {
        // The spike's injected crash. 500 is the honest status: the caller does
        // not know whether the work committed, which is precisely the state C1's
        // recovery path has to resolve from the step receipt.
        throw error;
      }

      throw error;
    }
  }
}
