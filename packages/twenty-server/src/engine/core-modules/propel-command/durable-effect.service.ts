import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { DataSource, Repository, type QueryRunner } from 'typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import {
  CommandKind,
  type ExecuteCommandInput,
} from 'src/engine/core-modules/propel-command/command-receipt.entity';
import {
  EffectReceiptEntity,
  EffectStatus,
  type EffectReceipt,
} from 'src/engine/core-modules/propel-command/effect-receipt.entity';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';

const toEffectReceipt = (entity: EffectReceiptEntity): EffectReceipt => ({
  commandId: entity.commandId,
  kind: entity.kind as CommandKind,
  status: entity.status as EffectStatus,
  result: isDefined(entity.result)
    ? (entity.result as Record<string, unknown>)
    : {},
  claimedAt: new Date(entity.claimedAt).toISOString(),
  appliedAt: isDefined(entity.appliedAt)
    ? new Date(entity.appliedAt).toISOString()
    : null,
  createdAt: new Date(entity.createdAt).toISOString(),
});

const isUniqueViolation = (error: unknown): boolean => {
  const candidate = error as {
    code?: string;
    driverError?: { code?: string };
  };

  return (
    candidate?.code === '23505' || candidate?.driverError?.code === '23505'
  );
};

// Exactly-once execution built on a durable claim:
//   1. CLAIM — one transaction inserts the effect_receipt row as CLAIMED. A
//      replayed APPLIED row short-circuits here and no step ever runs.
//   2. APPLY — one transaction runs the step and flips the same row to APPLIED
//      through the transaction's own queryRunner. The effect's write and its
//      record therefore commit or roll back together.
//
// A process killed between 1 and 2 leaves a committed CLAIMED row and no effect:
// resuming by commandId re-runs 2. A process killed inside 2 rolls the effect
// back with the record, so the effect is never applied twice.
@Injectable()
export class DurableEffectService {
  constructor(
    @InjectRepository(EffectReceiptEntity)
    private readonly effectReceiptRepository: Repository<EffectReceiptEntity>,
    private readonly dataSource: DataSource,
    private readonly assignmentStepService: AssignmentStepService,
    private readonly stageStepService: StageStepService,
  ) {}

  async execute(command: ExecuteCommandInput): Promise<EffectReceipt> {
    const claim = await this.claim(command);

    if (claim.status === EffectStatus.APPLIED) {
      return claim;
    }

    return this.applyClaimedEffect(command);
  }

  // Commits the claim on its own so it survives a crash in the step below. The
  // unique index on commandId makes the insert the arbiter between two racing
  // callers: the loser re-reads the winner's row instead of failing.
  private async claim(command: ExecuteCommandInput): Promise<EffectReceipt> {
    try {
      return await this.dataSource.transaction<EffectReceipt>(
        async (transactionManager) => {
          const { queryRunner } = transactionManager;

          if (!isDefined(queryRunner)) {
            throw new Error(
              'Expected queryRunner to be defined within the claim transaction',
            );
          }

          const existing = await queryRunner.manager.findOne(
            EffectReceiptEntity,
            { where: { commandId: command.commandId } },
          );

          if (isDefined(existing)) {
            return toEffectReceipt(existing);
          }

          const claimedAt = new Date();

          await queryRunner.manager.insert(EffectReceiptEntity, {
            commandId: command.commandId,
            kind: command.kind,
            status: EffectStatus.CLAIMED,
            // `undefined` lets TypeORM leave the column NULL until the step
            // result is known.
            result: undefined,
            claimedAt,
            appliedAt: null,
          });

          return {
            commandId: command.commandId,
            kind: command.kind,
            status: EffectStatus.CLAIMED,
            result: {},
            claimedAt: claimedAt.toISOString(),
            appliedAt: null,
            createdAt: claimedAt.toISOString(),
          };
        },
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.effectReceiptRepository.findOne({
        where: { commandId: command.commandId },
      });

      if (isDefined(existing)) {
        return toEffectReceipt(existing);
      }

      throw error;
    }
  }

  private async applyClaimedEffect(
    command: ExecuteCommandInput,
  ): Promise<EffectReceipt> {
    return this.dataSource.transaction<EffectReceipt>(
      async (transactionManager) => {
        const { queryRunner } = transactionManager;

        if (!isDefined(queryRunner)) {
          throw new Error(
            'Expected queryRunner to be defined within the effect transaction',
          );
        }

        // Lock the claim for the duration of the effect. A second resume of the
        // same commandId blocks here, then sees APPLIED and skips the step.
        const claimed = await queryRunner.manager.findOne(EffectReceiptEntity, {
          where: { commandId: command.commandId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!isDefined(claimed)) {
          throw new Error(
            `No durable claim for command ${command.commandId}; claim before applying`,
          );
        }

        if (claimed.status === EffectStatus.APPLIED) {
          return toEffectReceipt(claimed);
        }

        const result = await this.runStep(command, queryRunner);
        const appliedAt = new Date();

        // The record must go through the transaction's queryRunner. The
        // repository's ORM update passes an undefined query runner and commits
        // through a rollback, which would leave an APPLIED row behind a rolled
        // back effect.
        await queryRunner.manager.update(
          EffectReceiptEntity,
          { commandId: command.commandId },
          { status: EffectStatus.APPLIED, result, appliedAt },
        );

        return {
          commandId: command.commandId,
          kind: command.kind,
          status: EffectStatus.APPLIED,
          result,
          claimedAt: new Date(claimed.claimedAt).toISOString(),
          appliedAt: appliedAt.toISOString(),
          createdAt: new Date(claimed.createdAt).toISOString(),
        };
      },
    );
  }

  // One step service per command kind. Both are handed the transaction's own
  // queryRunner so their write is part of the same commit as the record.
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
