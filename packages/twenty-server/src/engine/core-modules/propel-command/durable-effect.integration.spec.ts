import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { type DataSource, type Repository } from 'typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import { AtomicCommandService } from 'src/engine/core-modules/propel-command/atomic-command.service';
import { CommandKind } from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { DurableEffectService } from 'src/engine/core-modules/propel-command/durable-effect.service';
import {
  EffectStatus,
  type EffectReceiptEntity,
} from 'src/engine/core-modules/propel-command/effect-receipt.entity';
import { PropelCommandController } from 'src/engine/core-modules/propel-command/propel-command.controller';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';

const MANAGER_ROLE_UID = '20000000-0000-4000-8000-000000000001';
const AGENT_ROLE_UID = '20000000-0000-4000-8000-000000000002';

const WORKSPACE_ID = 'workspace-1';

const buildCommand = (commandId: string, workspaceId = WORKSPACE_ID) => ({
  workspaceId,
  commandId,
  kind: CommandKind.ASSIGNMENT,
  payload: { recordId: 'record-1', assigneeWorkspaceMemberId: 'member-2' },
});

type StoredRow = Record<string, unknown>;

// The durable store keys rows by (workspaceId, commandId). A lookup that omits
// workspaceId falls back to the bare commandId, which is exactly how the
// unscoped code would behave: this is what makes a cross-workspace replay
// observable in the double.
const rowKey = (workspaceId: string | undefined, commandId: string) =>
  workspaceId === undefined ? commandId : `${workspaceId}::${commandId}`;

const readWhere = (options: {
  where: { workspaceId?: string; commandId: string };
}) => rowKey(options.where.workspaceId, options.where.commandId);

const buildStoredReceipt = (data: Record<string, unknown>): StoredRow => ({
  id: 'effect-receipt-id',
  workspaceId: data.workspaceId,
  commandId: data.commandId,
  kind: data.kind,
  status: data.status,
  result: data.result ?? null,
  claimedAt: new Date('2026-01-01T00:00:00.000Z'),
  appliedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('DurableEffectService', () => {
  let events: string[];
  let committedReceipts: Map<string, StoredRow>;
  let committedEffects: Map<string, StoredRow>;
  let effectExecutions: number;
  let failNextRecordUpdate: boolean;
  let effectReceiptRepository: { findOne: jest.Mock; update: jest.Mock };
  let assignmentStepService: { execute: jest.Mock };
  let service: DurableEffectService;

  beforeEach(() => {
    events = [];
    committedReceipts = new Map();
    committedEffects = new Map();
    effectExecutions = 0;
    failNextRecordUpdate = false;

    const dataSource = {
      transaction: jest.fn(
        async (run: (transactionManager: unknown) => Promise<unknown>) => {
          events.push('begin');

          // A transaction works on a staged copy of the durable state. The copy
          // is only published back to the committed maps when `run` resolves, so
          // a throw discards every write made in the transaction.
          const receiptStaging = new Map(committedReceipts);
          const effectStaging = new Map(committedEffects);

          const manager = {
            findOne: jest.fn(
              async (
                _entity: unknown,
                options: { where: { workspaceId?: string; commandId: string } },
              ) => {
                events.push('read-effect-receipt');

                return receiptStaging.get(readWhere(options)) ?? null;
              },
            ),
            insert: jest.fn(
              async (_entity: unknown, data: Record<string, unknown>) => {
                events.push('write-claim');
                receiptStaging.set(
                  rowKey(
                    data.workspaceId as string | undefined,
                    data.commandId as string,
                  ),
                  buildStoredReceipt(data),
                );
              },
            ),
            update: jest.fn(
              async (
                _entity: unknown,
                where: { workspaceId?: string; commandId: string },
                patch: Record<string, unknown>,
              ) => {
                if (failNextRecordUpdate) {
                  failNextRecordUpdate = false;

                  throw new Error('process killed between claim and record');
                }

                events.push('write-record');
                const key = readWhere({ where });

                receiptStaging.set(key, {
                  ...receiptStaging.get(key),
                  ...patch,
                });
              },
            ),
          };

          const queryRunner = {
            manager,
            query: jest.fn(async (_sql: string, params: unknown[]) => {
              events.push('write-effect');
              effectExecutions += 1;
              effectStaging.set(String(params[0]), { id: params[0] });
            }),
          };

          const result = await run({ queryRunner, manager });

          committedReceipts = receiptStaging;
          committedEffects = effectStaging;
          events.push('commit');

          return result;
        },
      ),
    };

    effectReceiptRepository = {
      findOne: jest.fn(async () => null),
      update: jest.fn(async () => undefined),
    };

    const realAssignmentStepService = new AssignmentStepService();

    assignmentStepService = {
      execute: jest.fn(
        (input: Parameters<AssignmentStepService['execute']>[0]) =>
          realAssignmentStepService.execute(input),
      ),
    };

    const realStageStepService = new StageStepService();

    service = new DurableEffectService(
      effectReceiptRepository as unknown as Repository<EffectReceiptEntity>,
      dataSource as unknown as DataSource,
      assignmentStepService as unknown as AssignmentStepService,
      {
        execute: jest.fn((input: Parameters<StageStepService['execute']>[0]) =>
          realStageStepService.execute(input),
        ),
      } as unknown as StageStepService,
    );
  });

  it('claims the step durably before executing it and records inside the effect transaction', async () => {
    const receipt = await service.execute(buildCommand('command-1'));

    expect(events).toEqual([
      'begin',
      'read-effect-receipt',
      'write-claim',
      'commit',
      'begin',
      'read-effect-receipt',
      'write-effect',
      'write-record',
      'commit',
    ]);
    expect(receipt.status).toBe(EffectStatus.APPLIED);
    expect(receipt.claimedAt).not.toBeNull();
    expect(receipt.appliedAt).not.toBeNull();
    expect(committedEffects.size).toBe(1);
    // The record write must ride the transaction's queryRunner, never the
    // repository (whose ORM update passes an undefined query runner and commits
    // through a rollback).
    expect(effectReceiptRepository.update).not.toHaveBeenCalled();
  });

  it('resumes a claimed-but-unfinished step and applies its effect exactly once', async () => {
    // The process dies after the effect statement ran but before the receipt was
    // recorded, so the effect transaction rolls back with it.
    failNextRecordUpdate = true;

    await expect(
      service.execute(buildCommand('command-kill')),
    ).rejects.toThrow('process killed between claim and record');

    // The claim survives the crash; the effect does not.
    expect(
      committedReceipts.get(rowKey(WORKSPACE_ID, 'command-kill'))?.status,
    ).toBe(EffectStatus.CLAIMED);
    expect(committedEffects.size).toBe(0);
    expect(effectReceiptRepository.update).not.toHaveBeenCalled();

    const resumed = await service.execute(buildCommand('command-kill'));

    expect(resumed.status).toBe(EffectStatus.APPLIED);
    expect(resumed.appliedAt).not.toBeNull();
    expect(
      committedReceipts.get(rowKey(WORKSPACE_ID, 'command-kill'))?.status,
    ).toBe(EffectStatus.APPLIED);
    expect(committedEffects.size).toBe(1);

    const replayed = await service.execute(buildCommand('command-kill'));

    expect(replayed.status).toBe(EffectStatus.APPLIED);
    // Resuming twice must never apply the effect a second time.
    expect(committedEffects.size).toBe(1);
    expect(effectExecutions).toBe(2);
  });

  it('never executes the effect again for an already-applied receipt', async () => {
    committedReceipts.set(
      rowKey(WORKSPACE_ID, 'command-done'),
      buildStoredReceipt({
        workspaceId: WORKSPACE_ID,
        commandId: 'command-done',
        kind: CommandKind.ASSIGNMENT,
        status: EffectStatus.APPLIED,
        result: { assignmentId: 'assignment-1' },
      }),
    );

    const receipt = await service.execute(buildCommand('command-done'));

    expect(receipt.status).toBe(EffectStatus.APPLIED);
    expect(receipt.result).toEqual({ assignmentId: 'assignment-1' });
    expect(effectExecutions).toBe(0);
    expect(assignmentStepService.execute).not.toHaveBeenCalled();
  });

  it('scopes the durable claim to the calling workspace so a shared commandId never replays across workspaces', async () => {
    const first = await service.execute(
      buildCommand('shared-command', 'workspace-1'),
    );
    const second = await service.execute(
      buildCommand('shared-command', 'workspace-2'),
    );

    // Both workspaces claim and apply their own effect; neither is handed the
    // other's receipt and neither command permanently no-ops.
    expect(assignmentStepService.execute).toHaveBeenCalledTimes(2);
    expect(effectExecutions).toBe(2);
    expect(first.status).toBe(EffectStatus.APPLIED);
    expect(second.status).toBe(EffectStatus.APPLIED);
    // A cross-workspace false ACK would leak workspace-1's assignmentId here.
    expect(second.result).not.toEqual(first.result);
    expect(
      committedReceipts.get(rowKey('workspace-1', 'shared-command')),
    ).toBeDefined();
    expect(
      committedReceipts.get(rowKey('workspace-2', 'shared-command')),
    ).toBeDefined();
  });

  it('rejects resuming a claim under a different command kind', async () => {
    committedReceipts.set(
      rowKey(WORKSPACE_ID, 'command-kind'),
      buildStoredReceipt({
        workspaceId: WORKSPACE_ID,
        commandId: 'command-kind',
        kind: CommandKind.STAGE_ADVANCE,
        status: EffectStatus.CLAIMED,
      }),
    );

    // The claim was recorded as a STAGE_ADVANCE; resuming it as an ASSIGNMENT
    // must not apply the new effect under the old claim.
    await expect(
      service.execute(buildCommand('command-kind')),
    ).rejects.toThrow('recorded as STAGE_ADVANCE but resumed as ASSIGNMENT');

    expect(effectExecutions).toBe(0);
  });
});

describe('PropelCommandController durable endpoint authorization', () => {
  const buildController = async (role: {
    universalIdentifier: string;
    label: string;
  }) => {
    const executeDurable = jest.fn(async (input: { commandId: string }) => ({
      commandId: input.commandId,
      kind: CommandKind.ASSIGNMENT,
      status: EffectStatus.APPLIED,
      result: {},
      claimedAt: '2026-01-01T00:00:00.000Z',
      appliedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    }));

    const testingModule = await Test.createTestingModule({
      controllers: [PropelCommandController],
      providers: [
        { provide: AtomicCommandService, useValue: { execute: jest.fn() } },
        { provide: DurableEffectService, useValue: { execute: executeDurable } },
        PropelTierService,
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

    return {
      controller: testingModule.get(PropelCommandController),
      executeDurable,
    };
  };

  it('denies an authenticated AGENT caller before any effect is claimed', async () => {
    const { controller, executeDurable } = await buildController({
      universalIdentifier: AGENT_ROLE_UID,
      label: 'Agent',
    });

    await expect(
      controller.executeDurable(
        buildCommand('command-6'),
        { id: 'workspace-1' } as unknown as WorkspaceEntity,
        'user-workspace-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(executeDurable).not.toHaveBeenCalled();
  });

  it('lets a MANAGER caller through to the durable effect service', async () => {
    const { controller, executeDurable } = await buildController({
      universalIdentifier: MANAGER_ROLE_UID,
      label: 'Manager',
    });

    await controller.executeDurable(
      buildCommand('command-7'),
      { id: 'workspace-1' } as unknown as WorkspaceEntity,
      'user-workspace-1',
    );

    expect(executeDurable).toHaveBeenCalledWith(buildCommand('command-7'));
  });
});
