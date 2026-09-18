import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { type QueryRunner } from 'typeorm';

import { CommandKind } from 'src/engine/core-modules/propel-command/command-receipt.entity';
import {
  isPropelStage,
  type PropelStage,
} from 'src/engine/core-modules/propel-command/propel-stage';

export interface StageStepInput {
  commandId: string;
  kind: CommandKind;
  payload: Record<string, unknown>;
}

const readRequiredString = (
  payload: Record<string, unknown>,
  key: string,
): string => {
  const value = payload[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Stage advance command is missing "${key}"`);
  }

  return value;
};

const readRequiredStage = (
  payload: Record<string, unknown>,
  key: string,
): PropelStage => {
  const value = payload[key];

  if (!isPropelStage(value)) {
    throw new Error(`Stage advance command has an unknown "${key}"`);
  }

  return value;
};

// The second step kind this engine module knows how to apply. It mirrors
// AssignmentStepService exactly: it runs inside the caller's transaction, is
// handed the transaction's queryRunner, and writes only through that runner so
// its row commits or rolls back together with the receipt. The transition it
// returns is what the receipt stores as the typed stage advance.
@Injectable()
export class StageStepService {
  async execute({
    command,
    queryRunner,
  }: {
    command: StageStepInput;
    queryRunner: QueryRunner;
  }): Promise<Record<string, unknown>> {
    if (command.kind !== CommandKind.STAGE_ADVANCE) {
      throw new Error(`Unsupported command kind: ${command.kind}`);
    }

    const recordId = readRequiredString(command.payload, 'recordId');
    const fromStage = readRequiredStage(command.payload, 'fromStage');
    const toStage = readRequiredStage(command.payload, 'toStage');
    const stageAdvanceId = randomUUID();

    await queryRunner.query(
      `INSERT INTO "core"."command_stage_advance" ("id", "commandId", "recordId", "fromStage", "toStage") VALUES ($1, $2, $3, $4, $5)`,
      [stageAdvanceId, command.commandId, recordId, fromStage, toStage],
    );

    return { stageAdvanceId, recordId, fromStage, toStage };
  }
}
