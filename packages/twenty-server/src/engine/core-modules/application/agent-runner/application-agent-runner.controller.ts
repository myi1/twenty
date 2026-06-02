import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { Request } from 'express';
import { type RunAgentResult } from 'twenty-shared/application';
import { isDefined } from 'twenty-shared/utils';

import { RunAgentDto } from 'src/engine/core-modules/application/agent-runner/dtos/run-agent.dto';
import { ApplicationAgentRunService } from 'src/engine/core-modules/application/agent-runner/services/application-agent-run.service';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

// Programmatic agent runs for app logic functions. Authenticated via the
// application access token already injected into the function runtime as
// TWENTY_APP_ACCESS_TOKEN. Apps can only run their own agents.
@Controller('apps/agents')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class ApplicationAgentRunnerController {
  constructor(
    private readonly applicationAgentRunService: ApplicationAgentRunService,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(
    @Req() request: Request,
    @Body() body: RunAgentDto,
  ): Promise<RunAgentResult> {
    if (!isDefined(request.application) || !isDefined(request.workspace)) {
      throw new ForbiddenException(
        'This endpoint requires an APPLICATION_ACCESS token.',
      );
    }

    return this.applicationAgentRunService.run({
      workspace: request.workspace,
      application: request.application,
      requestUserWorkspaceId: request.userWorkspaceId ?? null,
      input: {
        agentUniversalIdentifier: body.agentUniversalIdentifier,
        prompt: body.prompt,
      },
    });
  }
}
