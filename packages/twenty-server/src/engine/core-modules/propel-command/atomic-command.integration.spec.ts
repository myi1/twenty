import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { isDefined } from 'twenty-shared/utils';
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
import {
  PropelTierService,
  type PropelTier,
} from 'src/modules/propel-rls/propel-tier.service';

const MANAGER_ROLE_UID = '20000000-0000-4000-8000-000000000001';
const AGENT_ROLE_UID = '20000000-0000-4000-8000-000000000002';

const WORKSPACE_ID = 'workspace-1';

const buildCommand = (
  workspaceId: string,
  commandId: string,
): ExecuteCommandInput => ({
  workspaceId,
  commandId,
  kind: CommandKind.ASSIGNMENT,
  payload: { recordId: 'record-1', assigneeWorkspaceMemberId: 'member-2' },
});

const buildStoredReceipt = (
  overrides: Record<string, unknown>,
): CommandReceiptEntity =>
  ({
    id: 'receipt-id',
    workspaceId: WORKSPACE_ID,
    commandId: 'command-1',
    kind: CommandKind.ASSIGNMENT,
    status: CommandStatus.APPLIED,
    result: { assignmentId: 'assignment-1' },
    acknowledgedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as CommandReceiptEntity;

const uniqueViolation = () =>
  Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });

describe('AtomicCommandService', () => {
  let events: string[];
  // Mirrors the real store: rows are keyed by workspaceId + commandId once the
  // composite key exists, and by the bare commandId before it does. This is what
  // makes a cross-workspace replay observable.
  let storedReceipts: Map<string, CommandReceiptEntity>;
  let receiptRepository: { update: jest.Mock; findOne: jest.Mock };
  let assignmentStepService: { execute: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    insert: jest.Mock;
  };
  let service: AtomicCommandService;

  const rowKey = (workspaceId: string | undefined, commandId: string) =>
    workspaceId === undefined ? commandId : `${workspaceId}::${commandId}`;

  const readWhere = (options: {
    where: { workspaceId?: string; commandId: string };
  }) => rowKey(options.where.workspaceId, options.where.commandId);

  beforeEach(() => {
    events = [];
    storedReceipts = new Map();

    manager = {
      findOne: jest.fn(
        async (
          _entity: unknown,
          options: { where: { workspaceId?: string; commandId: string } },
        ) => {
          events.push('read-receipt');

          return storedReceipts.get(readWhere(options)) ?? null;
        },
      ),
      insert: jest.fn(
        async (_entity: unknown, data: Record<string, unknown>) => {
          events.push('write-receipt');
          storedReceipts.set(
            rowKey(
              data.workspaceId as string | undefined,
              data.commandId as string,
            ),
            buildStoredReceipt(data),
          );
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
      update: jest.fn(
        async (
          where: { workspaceId: string; commandId: string },
          patch: { acknowledgedAt: Date },
        ) => {
          events.push('acknowledge');
          const key = rowKey(where.workspaceId, where.commandId);
          const current = storedReceipts.get(key);

          if (current) {
            storedReceipts.set(key, { ...current, ...patch });
          }
        },
      ),
      findOne: jest.fn(
        async (options: {
          where: { workspaceId?: string; commandId: string };
        }) => {
          events.push('read-persisted-receipt');

          return storedReceipts.get(readWhere(options)) ?? null;
        },
      ),
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
    await service.execute(buildCommand(WORKSPACE_ID, 'command-1'));

    expect(events).toEqual([
      'begin',
      'read-receipt',
      'write-assignment',
      'write-receipt',
      'commit',
      'acknowledge',
      'read-persisted-receipt',
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

    await expect(
      service.execute(buildCommand(WORKSPACE_ID, 'command-2')),
    ).rejects.toThrow('assignment step failed');

    expect(events).not.toContain('commit');
    expect(events).not.toContain('acknowledge');
    expect(receiptRepository.update).not.toHaveBeenCalled();
  });

  it('scopes the dedupe lookup and the stored row to the calling workspace', async () => {
    await service.execute(buildCommand('workspace-1', 'shared-command'));
    await service.execute(buildCommand('workspace-2', 'shared-command'));

    // Both workspaces apply their own command; neither replays the other's.
    expect(assignmentStepService.execute).toHaveBeenCalledTimes(2);
    expect(manager.findOne.mock.calls[0][1]).toEqual({
      where: { workspaceId: 'workspace-1', commandId: 'shared-command' },
    });
    expect(manager.insert.mock.calls[0][1]).toMatchObject({
      workspaceId: 'workspace-1',
      commandId: 'shared-command',
    });
    expect(manager.insert.mock.calls[1][1]).toMatchObject({
      workspaceId: 'workspace-2',
      commandId: 'shared-command',
    });
  });

  it('does not leak one workspace receipt into another workspace replaying the same commandId', async () => {
    const first = await service.execute(
      buildCommand('workspace-1', 'shared-command'),
    );
    const second = await service.execute(
      buildCommand('workspace-2', 'shared-command'),
    );

    expect(first.result).toEqual({
      assignmentId: expect.any(String),
      recordId: 'record-1',
      assigneeWorkspaceMemberId: 'member-2',
    });
    // A cross-workspace false ACK would hand back workspace-1's assignmentId.
    expect(second.result).not.toEqual(first.result);
    expect(assignmentStepService.execute).toHaveBeenCalledTimes(2);
  });

  it('returns the stored receipt for a replayed commandId and performs no second write', async () => {
    storedReceipts.set(
      rowKey(WORKSPACE_ID, 'command-3'),
      buildStoredReceipt({
        commandId: 'command-3',
        acknowledgedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );

    const receipt = await service.execute(
      buildCommand(WORKSPACE_ID, 'command-3'),
    );

    expect(receipt).toEqual({
      commandId: 'command-3',
      kind: CommandKind.ASSIGNMENT,
      status: CommandStatus.APPLIED,
      result: { assignmentId: 'assignment-1' },
      stageTransition: null,
      acknowledgedAt: '2026-01-02T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(assignmentStepService.execute).not.toHaveBeenCalled();
    expect(receiptRepository.update).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'read-receipt', 'commit']);
  });

  it('returns the committed row, with its acknowledgement, after the receipt commits', async () => {
    const receipt = await service.execute(
      buildCommand(WORKSPACE_ID, 'command-ack'),
    );

    const acknowledgedAt = (
      receiptRepository.update.mock.calls[0][1] as { acknowledgedAt: Date }
    ).acknowledgedAt;

    // The acknowledgement written after the commit is what the caller is told.
    expect(receipt.acknowledgedAt).toBe(acknowledgedAt.toISOString());
    // createdAt comes from the persisted row, not the application clock.
    expect(receipt.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('turns a concurrent duplicate insert into a replay instead of a raw 500', async () => {
    // The winner commits while this caller is inside its own transaction: the
    // pre-read missed it, so the insert loses on the composite unique index.
    manager.insert.mockImplementationOnce(async () => {
      storedReceipts.set(
        rowKey(WORKSPACE_ID, 'command-race'),
        buildStoredReceipt({
          commandId: 'command-race',
          result: { assignmentId: 'winner-assignment' },
          acknowledgedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      );

      throw uniqueViolation();
    });

    const receipt = await service.execute(
      buildCommand(WORKSPACE_ID, 'command-race'),
    );

    expect(receipt).toEqual({
      commandId: 'command-race',
      kind: CommandKind.ASSIGNMENT,
      status: CommandStatus.APPLIED,
      result: { assignmentId: 'winner-assignment' },
      stageTransition: null,
      acknowledgedAt: '2026-01-02T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(receiptRepository.findOne).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, commandId: 'command-race' },
    });
    // The loser never acknowledges a row it did not write.
    expect(receiptRepository.update).not.toHaveBeenCalled();
  });

  it('rethrows a non-unique insert failure', async () => {
    manager.insert.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      service.execute(buildCommand(WORKSPACE_ID, 'command-boom')),
    ).rejects.toThrow('connection reset');
  });

  it('only publishes the acknowledged receipt after the transaction commits', async () => {
    // Commit-gated double: the receipt row becomes visible to the acknowledgement
    // write only when `run` resolves. An acknowledgement written inside the
    // transaction (before commit) would not find the row and would throw.
    const persisted = new Map<string, CommandReceiptEntity>();

    // Writes land in `staged` and only reach `persisted` when the transaction
    // resolves, so the acknowledgement cannot see an uncommitted receipt.
    let staged = new Map<string, CommandReceiptEntity>();

    const gatedManager = {
      findOne: jest.fn(async () => null),
      insert: jest.fn(
        async (_entity: unknown, data: Record<string, unknown>) => {
          staged.set(
            rowKey(
              data.workspaceId as string | undefined,
              data.commandId as string,
            ),
            buildStoredReceipt(data),
          );
        },
      ),
    };
    const gatedQueryRunner = {
      manager: gatedManager,
      query: jest.fn(async () => undefined),
    };
    const gatedDataSource = {
      transaction: jest.fn(
        async (run: (transactionManager: unknown) => Promise<unknown>) => {
          staged = new Map(persisted);
          const result = await run({
            queryRunner: gatedQueryRunner,
            manager: gatedManager,
          });

          // Commit publishes the staged rows.
          for (const [key, row] of staged) {
            persisted.set(key, row);
          }

          return result;
        },
      ),
    };

    const ackRepository = {
      update: jest.fn(
        async (
          where: { workspaceId: string; commandId: string },
          patch: { acknowledgedAt: Date },
        ) => {
          const key = rowKey(where.workspaceId, where.commandId);
          const current = persisted.get(key);

          // The acknowledgement may only be written once the receipt is
          // committed and therefore visible.
          if (!current) {
            throw new Error('receipt row not visible to the acknowledgement');
          }

          persisted.set(key, { ...current, ...patch });
        },
      ),
      findOne: jest.fn(
        async (options: {
          where: { workspaceId?: string; commandId: string };
        }) => persisted.get(readWhere(options)) ?? null,
      ),
    };

    // The committed map is the source the acknowledgement reads from.
    const gatedService = new AtomicCommandService(
      ackRepository as unknown as Repository<CommandReceiptEntity>,
      gatedDataSource as unknown as DataSource,
      assignmentStepService as unknown as AssignmentStepService,
      new StageStepService(),
    );

    const receipt = await gatedService.execute(
      buildCommand(WORKSPACE_ID, 'command-gated'),
    );

    const stored = persisted.get(rowKey(WORKSPACE_ID, 'command-gated'));

    expect(stored).toBeDefined();
    expect(stored?.acknowledgedAt).not.toBeNull();
    expect(receipt.acknowledgedAt).not.toBeNull();
  });
});

describe('PropelCommandController authorization', () => {
  const buildBody = (commandId: string) => ({
    commandId,
    kind: CommandKind.ASSIGNMENT,
    payload: { recordId: 'record-1', assigneeWorkspaceMemberId: 'member-2' },
  });

  const buildController = async (
    role: { universalIdentifier: string; label: string },
    tierOverride?: PropelTier,
  ) => {
    const execute = jest.fn(async (input: ExecuteCommandInput) => ({
      commandId: input.commandId,
      kind: input.kind,
      status: CommandStatus.APPLIED,
      result: {},
      stageTransition: null,
      acknowledgedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));

    const tierProvider = isDefined(tierOverride)
      ? {
          provide: PropelTierService,
          useValue: { resolveTierForUser: jest.fn(async () => tierOverride) },
        }
      : PropelTierService;

    const testingModule = await Test.createTestingModule({
      controllers: [PropelCommandController],
      providers: [
        { provide: AtomicCommandService, useValue: { execute } },
        { provide: DurableEffectService, useValue: { execute: jest.fn() } },
        tierProvider,
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
        buildBody('command-4'),
        { id: WORKSPACE_ID } as unknown as WorkspaceEntity,
        'user-workspace-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(execute).not.toHaveBeenCalled();
  });

  it('lets a MANAGER caller through to the atomic service scoped to its workspace', async () => {
    const { controller, execute } = await buildController({
      universalIdentifier: MANAGER_ROLE_UID,
      label: 'Manager',
    });

    await controller.execute(
      buildBody('command-5'),
      { id: WORKSPACE_ID } as unknown as WorkspaceEntity,
      'user-workspace-1',
    );

    expect(execute).toHaveBeenCalledWith({
      ...buildBody('command-5'),
      workspaceId: WORKSPACE_ID,
    });
  });

  it('authorises through the shared PropelTierService rather than a hand-mirrored copy', async () => {
    // The role would fail closed to AGENT, but the shared tier service — the one
    // the RLS layer uses — says MANAGER. The controller must follow the service.
    const { controller, execute } = await buildController(
      { universalIdentifier: AGENT_ROLE_UID, label: 'Agent' },
      'MANAGER',
    );

    await controller.execute(
      buildBody('command-tier'),
      { id: WORKSPACE_ID } as unknown as WorkspaceEntity,
      'user-workspace-1',
    );

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
