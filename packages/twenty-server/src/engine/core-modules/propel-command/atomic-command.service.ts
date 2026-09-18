import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { DataSource, Repository } from 'typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import {
  CommandReceiptEntity,
  type CommandReceipt,
  CommandStatus,
  type ExecuteCommandInput,
} from 'src/engine/core-modules/propel-command/command-receipt.entity';

const toCommandReceipt = (
  entity: CommandReceiptEntity,
): CommandReceipt => ({
  commandId: entity.commandId,
  kind: entity.kind as CommandReceipt['kind'],
  status: entity.status as CommandStatus,
  result: isDefined(entity.result)
    ? (entity.result as Record<string, unknown>)
    : {},
  acknowledgedAt: isDefined(entity.acknowledgedAt)
    ? new Date(entity.acknowledgedAt).toISOString()
    : null,
  createdAt: new Date(entity.createdAt).toISOString(),
});

interface CommandOutcome {
  replayed: boolean;
  receipt: CommandReceipt;
}

// Exactly one transaction per command:
//   1. look the commandId up — a hit returns the stored receipt and writes nothing;
//   2. run the step and write the receipt through the TRANSACTION's queryRunner;
//   3. commit;
//   4. only then acknowledge.
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
  ) {}

  async execute(command: ExecuteCommandInput): Promise<CommandReceipt> {
    const outcome = await this.dataSource.transaction<CommandOutcome>(
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

        const existing = await queryRunner.manager.findOne(
          CommandReceiptEntity,
          { where: { commandId: command.commandId } },
        );

        if (isDefined(existing)) {
          return { replayed: true, receipt: toCommandReceipt(existing) };
        }

        const result = await this.assignmentStepService.execute({
          command,
          queryRunner,
        });

        const createdAt = new Date();

        await queryRunner.manager.insert(CommandReceiptEntity, {
          commandId: command.commandId,
          kind: command.kind,
          status: CommandStatus.APPLIED,
          result,
          acknowledgedAt: null,
        });

        return {
          replayed: false,
          receipt: {
            commandId: command.commandId,
            kind: command.kind,
            status: CommandStatus.APPLIED,
            result,
            acknowledgedAt: null,
            createdAt: createdAt.toISOString(),
          },
        };
      },
    );

    if (!outcome.replayed) {
      await this.commandReceiptRepository.update(
        { commandId: outcome.receipt.commandId },
        { acknowledgedAt: new Date() },
      );
    }

    return outcome.receipt;
  }
}
