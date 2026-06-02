import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { AgentAsyncExecutorService } from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-async-executor.service';
import { AgentEntity } from 'src/engine/metadata-modules/ai/ai-agent/entities/agent.entity';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';

import { ApplicationAgentRunService } from '../application-agent-run.service';

describe('ApplicationAgentRunService', () => {
  const agent = { id: 'agent-1', universalIdentifier: 'uid-1' } as AgentEntity;
  const workspace = { id: 'ws-1' } as FlatWorkspace;
  const application = { id: 'app-1' };

  const findOne = jest.fn();
  const executeAgent = jest.fn();

  let service: ApplicationAgentRunService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApplicationAgentRunService,
        { provide: AgentAsyncExecutorService, useValue: { executeAgent } },
        {
          provide: getWorkspaceScopedRepositoryToken(AgentEntity),
          useValue: { findOne },
        },
      ],
    }).compile();

    service = moduleRef.get(ApplicationAgentRunService);
  });

  it('runs the resolved agent and returns its result', async () => {
    findOne.mockResolvedValue(agent);
    executeAgent.mockResolvedValue({
      result: { response: 'ok' },
      hasNoMoreAvailableCredits: false,
    });

    const result = await service.run({
      workspace,
      application: application as never,
      requestUserWorkspaceId: 'uws-1',
      input: { agentUniversalIdentifier: 'uid-1', prompt: 'do it' },
    });

    expect(findOne).toHaveBeenCalledWith('ws-1', {
      where: { universalIdentifier: 'uid-1', applicationId: 'app-1' },
    });
    expect(executeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent,
        userPrompt: 'do it',
        workspaceId: 'ws-1',
        userWorkspaceId: 'uws-1',
        authContext: expect.objectContaining({ type: 'application' }),
      }),
    );
    expect(result).toEqual({
      result: { response: 'ok' },
      hasNoMoreAvailableCredits: false,
    });
  });

  it('throws NotFoundException when the agent does not belong to the app', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.run({
        workspace,
        application: application as never,
        requestUserWorkspaceId: null,
        input: { agentUniversalIdentifier: 'missing', prompt: 'x' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(executeAgent).not.toHaveBeenCalled();
  });
});
