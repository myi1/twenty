import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { type DataSource, type Repository } from 'typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import { AtomicCommandService } from 'src/engine/core-modules/propel-command/atomic-command.service';
import {
  CommandKind,
  CommandStatus,
  type CommandReceiptEntity,
  type ExecuteCommandInput,
} from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { DurableEffectService } from 'src/engine/core-modules/propel-command/durable-effect.service';
import { PropelCommandController } from 'src/engine/core-modules/propel-command/propel-command.controller';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';

const MANAGER_ROLE_UID = '20000000-0000-4000-8000-000000000001';
const AGENT_ROLE_UID = '20000000-0000-4000-8000-000000000002';

const buildCommand = (commandId: string): ExecuteCommandInput => ({
  commandId,
  kind: CommandKind.ASSIGNMENT,
  payload: { recordId: 'record-1', assigneeWorkspaceMemberId: 'member-2' },
});

const buildStoredReceipt = (
  overrides: Record<string, unknown>,
): CommandReceiptEntity =>
  ({
    id: 'receipt-id',
    commandId: 'command-1',
    kind: CommandKind.ASSIGNMENT,
    status: CommandStatus.APPLIED,
    result: { assignmentId: 'assignment-1' },
    acknowledgedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as CommandReceiptEntity;

describe('AtomicCommandService', () => {
  let events: string[];
  let storedReceipt: CommandReceiptEntity | null;
  let receiptRepository: { update: jest.Mock };
  let assignmentStepService: { execute: jest.Mock };
  let service: AtomicCommandService;

  beforeEach(() => {
    events = [];
    storedReceipt = null;

    const manager = {
      findOne: jest.fn(async () => {
        events.push('read-receipt');

        return storedReceipt;
      }),
      insert: jest.fn(
        async (_entity: unknown, data: Record<string, unknown>) => {
          events.push('write-receipt');
          storedReceipt = buildStoredReceipt(data);
        },
      ),
    };

    const queryRunner = {
      manager,
      query: jest.fn(async () => {
        events.push('write-assignment');
      }),
    };

    const dataSource = {
      transaction: jest.fn(
        async (run: (transactionManager: unknown) => Promise<unknown>) => {
          events.push('begin');
          const result = await run({ queryRunner, manager });

          events.push('commit');

          return result;
        },
      ),
    };

    receiptRepository = {
      update: jest.fn(async () => {
        events.push('acknowledge');
      }),
    };

    const realAssignmentStepService = new AssignmentStepService();

    assignmentStepService = {
      execute: jest.fn((input: Parameters<AssignmentStepService['execute']>[0]) =>
        realAssignmentStepService.execute(input),
      ),
    };

    const realStageStepService = new StageStepService();
    const stageStepService = {
      execute: jest.fn((input: Parameters<StageStepService['execute']>[0]) =>
        realStageStepService.execute(input),
      ),
    };

    service = new AtomicCommandService(
      receiptRepository as unknown as Repository<CommandReceiptEntity>,
      dataSource as unknown as DataSource,
      assignmentStepService as unknown as AssignmentStepService,
      stageStepService as unknown as StageStepService,
    );
  });

  it('runs the step inside the transaction and acknowledges only after the receipt commits', async () => {
    await service.execute(buildCommand('command-1'));

    expect(events).toEqual([
      'begin',
      'read-receipt',
      'write-assignment',
      'write-receipt',
      'commit',
      'acknowledge',
    ]);
    // The acknowledgement must not be written before the receipt commits.
    expect(events.indexOf('commit')).toBeLessThan(
      events.indexOf('acknowledge'),
    );
  });

  it('never acknowledges a command whose transaction rolled back', async () => {
    assignmentStepService.execute.mockRejectedValueOnce(
      new Error('assignment step failed'),
    );

    await expect(service.execute(buildCommand('command-2'))).rejects.toThrow(
      'assignment step failed',
    );

    expect(events).not.toContain('commit');
    expect(events).not.toContain('acknowledge');
    expect(receiptRepository.update).not.toHaveBeenCalled();
  });

  it('returns the stored receipt for a replayed commandId and performs no second write', async () => {
    storedReceipt = buildStoredReceipt({ commandId: 'command-3' });

    const receipt = await service.execute(buildCommand('command-3'));

    expect(receipt).toEqual({
      commandId: 'command-3',
      kind: CommandKind.ASSIGNMENT,
      status: CommandStatus.APPLIED,
      result: { assignmentId: 'assignment-1' },
      stageTransition: null,
      acknowledgedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(assignmentStepService.execute).not.toHaveBeenCalled();
    expect(receiptRepository.update).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'read-receipt', 'commit']);
  });
});

describe('PropelCommandController authorization', () => {
  const buildController = async (role: {
    universalIdentifier: string;
    label: string;
  }) => {
    const execute = jest.fn(async (input: ExecuteCommandInput) => ({
      commandId: input.commandId,
      kind: input.kind,
      status: CommandStatus.APPLIED,
      result: {},
      acknowledgedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));

    const testingModule = await Test.createTestingModule({
      controllers: [PropelCommandController],
      providers: [
        { provide: AtomicCommandService, useValue: { execute } },
        { provide: DurableEffectService, useValue: { execute: jest.fn() } },
        {
          provide: RoleService,
          useValue: { getRoleById: jest.fn(async () => role) },
        },
        {
          provide: UserRoleService,
          useValue: {
            getRoleIdForUserWorkspace: jest.fn(async () => 'role-id'),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(NoPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    return { controller: testingModule.get(PropelCommandController), execute };
  };

  it('denies an AGENT caller that the guards already authenticated', async () => {
    const { controller, execute } = await buildController({
      universalIdentifier: AGENT_ROLE_UID,
      label: 'Agent',
    });

    await expect(
      controller.execute(
        buildCommand('command-4'),
        { id: 'workspace-1' } as unknown as WorkspaceEntity,
        'user-workspace-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(execute).not.toHaveBeenCalled();
  });

  it('lets a MANAGER caller through to the atomic service', async () => {
    const { controller, execute } = await buildController({
      universalIdentifier: MANAGER_ROLE_UID,
      label: 'Manager',
    });

    await controller.execute(
      buildCommand('command-5'),
      { id: 'workspace-1' } as unknown as WorkspaceEntity,
      'user-workspace-1',
    );

    expect(execute).toHaveBeenCalledWith(buildCommand('command-5'));
  });
});
