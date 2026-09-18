import { type DataSource, type QueryRunner, type Repository } from 'typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import { AtomicCommandService } from 'src/engine/core-modules/propel-command/atomic-command.service';
import {
  CommandKind,
  CommandStatus,
  type CommandReceiptEntity,
  type ExecuteCommandInput,
} from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';

const WORKSPACE_ID = 'workspace-1';

const buildStageCommand = (commandId: string): ExecuteCommandInput => ({
  workspaceId: WORKSPACE_ID,
  commandId,
  kind: CommandKind.STAGE_ADVANCE,
  payload: { recordId: 'record-1', fromStage: 'QUALIFIED', toStage: 'PROPOSAL' },
});

const buildStoredReceipt = (
  overrides: Record<string, unknown>,
): CommandReceiptEntity =>
  ({
    id: 'receipt-id',
    workspaceId: WORKSPACE_ID,
    commandId: 'command-1',
    kind: CommandKind.STAGE_ADVANCE,
    status: CommandStatus.APPLIED,
    result: {
      stageAdvanceId: 'stage-advance-1',
      recordId: 'record-1',
      fromStage: 'QUALIFIED',
      toStage: 'PROPOSAL',
    },
    stageTransition: { from: 'QUALIFIED', to: 'PROPOSAL' },
    acknowledgedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as CommandReceiptEntity;

describe('StageStepService', () => {
  it('rejects a stage outside the typed set without writing a row', async () => {
    const query = jest.fn(
      async (_sql: string, _params?: unknown[]) => undefined,
    );
    const service = new StageStepService();

    await expect(
      service.execute({
        command: {
          workspaceId: WORKSPACE_ID,
          commandId: 'command-invalid',
          kind: CommandKind.STAGE_ADVANCE,
          payload: { recordId: 'record-1', fromStage: 'QUALIFIED', toStage: 'ARCHIVED' },
        },
        queryRunner: { query } as unknown as QueryRunner,
      }),
    ).rejects.toThrow('unknown "toStage"');

    expect(query).not.toHaveBeenCalled();
  });

  it('writes the advance through the transaction queryRunner', async () => {
    const query = jest.fn(
      async (_sql: string, _params?: unknown[]) => undefined,
    );
    const service = new StageStepService();

    const result = await service.execute({
      command: buildStageCommand('command-step'),
      queryRunner: { query } as unknown as QueryRunner,
    });

    expect(result).toMatchObject({
      recordId: 'record-1',
      fromStage: 'QUALIFIED',
      toStage: 'PROPOSAL',
    });
    expect(query).toHaveBeenCalledTimes(1);
    // The workspaceId is the second bound parameter: without it, rows sharing a
    // commandId across workspaces would be indistinguishable.
    expect(query.mock.calls[0][1]).toEqual([
      expect.any(String),
      WORKSPACE_ID,
      'command-step',
      'record-1',
      'QUALIFIED',
      'PROPOSAL',
    ]);
  });

  it('scopes the stage advance row to the calling workspace', async () => {
    const query = jest.fn(
      async (_sql: string, _params?: unknown[]) => undefined,
    );
    const service = new StageStepService();

    await service.execute({
      command: { ...buildStageCommand('shared-command'), workspaceId: 'workspace-1' },
      queryRunner: { query } as unknown as QueryRunner,
    });
    await service.execute({
      command: { ...buildStageCommand('shared-command'), workspaceId: 'workspace-2' },
      queryRunner: { query } as unknown as QueryRunner,
    });

    // The same commandId in a second workspace must write its own row, not be
    // conflated with the first workspace's.
    expect(query.mock.calls[0][1]?.[1]).toBe('workspace-1');
    expect(query.mock.calls[1][1]?.[1]).toBe('workspace-2');
  });
});

describe('AtomicCommandService stage advance', () => {
  let events: string[];
  let storedReceipt: CommandReceiptEntity | null;
  let receiptRepository: { update: jest.Mock; findOne: jest.Mock };
  let stageStepService: { execute: jest.Mock };
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
        events.push('write-stage-advance');
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
          _where: { workspaceId: string; commandId: string },
          patch: { acknowledgedAt: Date },
        ) => {
          events.push('acknowledge');

          if (storedReceipt) {
            storedReceipt = { ...storedReceipt, ...patch };
          }
        },
      ),
      findOne: jest.fn(async () => {
        events.push('read-persisted-receipt');

        return storedReceipt;
      }),
    };

    const realStageStepService = new StageStepService();

    stageStepService = {
      execute: jest.fn((input: Parameters<StageStepService['execute']>[0]) =>
        realStageStepService.execute(input),
      ),
    };

    service = new AtomicCommandService(
      receiptRepository as unknown as Repository<CommandReceiptEntity>,
      dataSource as unknown as DataSource,
      { execute: jest.fn() } as unknown as AssignmentStepService,
      stageStepService as unknown as StageStepService,
    );
  });

  it('records the typed transition and acknowledges only after the receipt commits', async () => {
    const receipt = await service.execute(buildStageCommand('command-1'));

    expect(events).toEqual([
      'begin',
      'read-receipt',
      'write-stage-advance',
      'write-receipt',
      'commit',
      'acknowledge',
      'read-persisted-receipt',
    ]);
    // Fails if the acknowledgement is written before the receipt commits.
    expect(events.indexOf('write-receipt')).toBeLessThan(
      events.indexOf('commit'),
    );
    expect(events.indexOf('commit')).toBeLessThan(
      events.indexOf('acknowledge'),
    );
    expect(receipt.stageTransition).toEqual({
      from: 'QUALIFIED',
      to: 'PROPOSAL',
    });
    expect(receipt.status).toBe(CommandStatus.APPLIED);
  });

  it('does not acknowledge a stage advance whose transaction rolled back', async () => {
    stageStepService.execute.mockRejectedValueOnce(
      new Error('stage step failed'),
    );

    await expect(service.execute(buildStageCommand('command-2'))).rejects.toThrow(
      'stage step failed',
    );

    expect(events).not.toContain('commit');
    expect(events).not.toContain('acknowledge');
    expect(receiptRepository.update).not.toHaveBeenCalled();
  });

  it('returns the same receipt on replay and never advances the stage twice', async () => {
    const first = await service.execute(buildStageCommand('command-3'));
    const callsAfterFirst = stageStepService.execute.mock.calls.length;

    const replayed = await service.execute(buildStageCommand('command-3'));

    // Same receipt content as the first call (createdAt differs only because the
    // in-memory double stamps the stored row with its own fixed clock).
    expect(replayed.commandId).toBe(first.commandId);
    expect(replayed.kind).toBe(first.kind);
    expect(replayed.status).toBe(first.status);
    expect(replayed.result).toEqual(first.result);
    expect(replayed.stageTransition).toEqual(first.stageTransition);
    expect(replayed.acknowledgedAt).toBe(first.acknowledgedAt);
    expect(replayed.stageTransition).toEqual({
      from: 'QUALIFIED',
      to: 'PROPOSAL',
    });
    // The stage step must not run a second time for the same commandId.
    expect(stageStepService.execute).toHaveBeenCalledTimes(callsAfterFirst);
    expect(stageStepService.execute).toHaveBeenCalledTimes(1);
    expect(receiptRepository.update).toHaveBeenCalledTimes(1);
  });
});
