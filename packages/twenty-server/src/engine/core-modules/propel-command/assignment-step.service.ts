import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { type QueryRunner } from 'typeorm';

import { CommandKind } from 'src/engine/core-modules/propel-command/command-receipt.entity';

export interface AssignmentStepInput {
  workspaceId: string;
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
    throw new Error(`Assignment command is missing "${key}"`);
  }

  return value;
};

// The one step kind this engine module knows how to apply. It runs inside the
// caller's transaction — it is handed the transaction's queryRunner, so the
// assignment row it writes commits or rolls back together with the receipt.
@Injectable()
export class AssignmentStepService {
  async execute({
    command,
    queryRunner,
  }: {
    command: AssignmentStepInput;
    queryRunner: QueryRunner;
  }): Promise<Record<string, unknown>> {
    if (command.kind !== CommandKind.ASSIGNMENT) {
      throw new Error(`Unsupported command kind: ${command.kind}`);
    }

    const recordId = readRequiredString(command.payload, 'recordId');
    const assigneeWorkspaceMemberId = readRequiredString(
      command.payload,
      'assigneeWorkspaceMemberId',
    );
    const assignmentId = randomUUID();

    await queryRunner.query(
      `INSERT INTO "core"."command_assignment" ("id", "workspaceId", "commandId", "recordId", "assigneeWorkspaceMemberId") VALUES ($1, $2, $3, $4, $5)`,
      [
        assignmentId,
        command.workspaceId,
        command.commandId,
        recordId,
        assigneeWorkspaceMemberId,
      ],
    );

    return { assignmentId, recordId, assigneeWorkspaceMemberId };
  }
}
