import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { DataSource, Repository, type QueryRunner } from 'typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import {
  CommandReceiptEntity,
  type CommandReceipt,
  CommandStatus,
  type ExecuteCommandInput,
  CommandKind,
} from 'src/engine/core-modules/propel-command/command-receipt.entity';
import {
  isPropelStage,
  type StageTransition,
} from 'src/engine/core-modules/propel-command/propel-stage';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';

const toCommandReceipt = (
  entity: CommandReceiptEntity,
): CommandReceipt => ({
  commandId: entity.commandId,
  kind: entity.kind as CommandReceipt['kind'],
  status: entity.status as CommandStatus,
  result: isDefined(entity.result)
    ? (entity.result as Record<string, unknown>)
    : {},
  stageTransition: toStoredStageTransition(entity.stageTransition),
  acknowledgedAt: isDefined(entity.acknowledgedAt)
    ? new Date(entity.acknowledgedAt).toISOString()
    : null,
  createdAt: new Date(entity.createdAt).toISOString(),
});

const toStoredStageTransition = (value: unknown): StageTransition | null => {
  if (!isDefined(value) || typeof value !== 'object') {
    return null;
  }

  const { from, to } = value as Record<string, unknown>;

  if (!isPropelStage(from) || !isPropelStage(to)) {
    return null;
  }

  return { from, to };
};

// The step's result is untrusted `Record<string, unknown>`, so the transition is
// re-validated here against the typed stage set before it is written to the
// receipt. A step that returned garbage would fail the transaction rather than
// record a malformed transition.
const toStageTransition = (
  kind: CommandKind,
  result: Record<string, unknown>,
): StageTransition | null => {
  if (kind !== CommandKind.STAGE_ADVANCE) {
    return null;
  }

  const transition = toStoredStageTransition({
    from: result.fromStage,
    to: result.toStage,
  });

  if (!isDefined(transition)) {
    throw new Error('Stage advance command produced an invalid transition');
  }

  return transition;
};

interface CommandOutcome {
  replayed: boolean;
  receipt: CommandReceipt;
}

// Two callers racing on the same (workspaceId, commandId) both pass the
// pre-read; the loser dies on the composite unique index. A raw 500 would be
// wrong — the command WAS applied — so the violation is turned into a replay.
const isUniqueViolation = (error: unknown): boolean => {
  const candidate = error as {
    code?: string;
    driverError?: { code?: string };
  };

  return (
    candidate?.code === '23505' || candidate?.driverError?.code === '23505'
  );
};

// Exactly one transaction per command:
//   1. look (workspaceId, commandId) up — a hit returns the stored receipt and
//      writes nothing; a unique violation on the insert means a concurrent
//      caller won and its receipt is re-read as a replay;
//   2. run the step and write the receipt through the TRANSACTION's queryRunner;
//   3. commit;
//   4. only then acknowledge, and re-read the committed row.
//
// The acknowledgement is deliberately outside the transaction. If it were
// written inside, a rollback after the acknowledgement would leave a caller
// holding an acknowledgement for a command that was never applied.
@Injectable()
export class AtomicCommandService {
  constructor(
    @InjectRepository(CommandReceiptEntity)
    private readonly commandReceiptRepository: Repository<CommandReceiptEntity>,
    private readonly dataSource: DataSource,
    private readonly assignmentStepService: AssignmentStepService,
    private readonly stageStepService: StageStepService,
  ) {}

  async execute(command: ExecuteCommandInput): Promise<CommandReceipt> {
    let outcome: CommandOutcome;

    try {
      outcome = await this.dataSource.transaction<CommandOutcome>(
        async (transactionManager) => {
          // `transactionManager.queryRunner` is the only handle that is guaranteed
          // to be bound to this transaction. Passing `undefined` around (as the
          // workspace ORM's `update` does) runs the write on the pooled connection
          // and it survives a rollback.
          const { queryRunner } = transactionManager;

          if (!isDefined(queryRunner)) {
            throw new Error(
              'Expected queryRunner to be defined within the command transaction',
            );
          }

          // The dedupe key is the workspace-scoped identity of the command, not
          // the bare commandId: two workspaces may use the same commandId.
          const existing = await queryRunner.manager.findOne(
            CommandReceiptEntity,
            {
              where: {
                workspaceId: command.workspaceId,
                commandId: command.commandId,
              },
            },
          );

          if (isDefined(existing)) {
            return { replayed: true, receipt: toCommandReceipt(existing) };
          }

          const result = await this.runStep(command, queryRunner);
          const stageTransition = toStageTransition(command.kind, result);
          const createdAt = new Date();

          await queryRunner.manager.insert(CommandReceiptEntity, {
            workspaceId: command.workspaceId,
            commandId: command.commandId,
            kind: command.kind,
            status: CommandStatus.APPLIED,
            result,
            // `undefined` lets TypeORM omit the column and leave it NULL, which is
            // what a non-stage command needs.
            stageTransition: stageTransition ?? undefined,
            acknowledgedAt: null,
          });

          return {
            replayed: false,
            receipt: {
              commandId: command.commandId,
              kind: command.kind,
              status: CommandStatus.APPLIED,
              result,
              stageTransition,
              acknowledgedAt: null,
              createdAt: createdAt.toISOString(),
            },
          };
        },
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      // A concurrent caller won the composite unique index. Its command was
      // applied, so return its receipt as a replay rather than a raw 500.
      const winner = await this.commandReceiptRepository.findOne({
        where: {
          workspaceId: command.workspaceId,
          commandId: command.commandId,
        },
      });

      if (!isDefined(winner)) {
        throw error;
      }

      return toCommandReceipt(winner);
    }

    if (outcome.replayed) {
      return outcome.receipt;
    }

    await this.commandReceiptRepository.update(
      { workspaceId: command.workspaceId, commandId: command.commandId },
      { acknowledgedAt: new Date() },
    );

    // The in-transaction receipt is a pre-commit snapshot: acknowledgedAt is
    // always null and createdAt comes from the application clock. Re-read the
    // committed row so the caller sees the acknowledgement and the DB timestamps.
    const committed = await this.commandReceiptRepository.findOne({
      where: {
        workspaceId: command.workspaceId,
        commandId: command.commandId,
      },
    });

    return isDefined(committed) ? toCommandReceipt(committed) : outcome.receipt;
  }

  // One step service per command kind. Both are handed the transaction's own
  // queryRunner so their write is part of the same commit as the receipt.
  private async runStep(
    command: ExecuteCommandInput,
    queryRunner: QueryRunner,
  ): Promise<Record<string, unknown>> {
    if (command.kind === CommandKind.ASSIGNMENT) {
      return this.assignmentStepService.execute({ command, queryRunner });
    }

    if (command.kind === CommandKind.STAGE_ADVANCE) {
      return this.stageStepService.execute({ command, queryRunner });
    }

    throw new Error(`Unsupported command kind: ${command.kind}`);
  }
}
