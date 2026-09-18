import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { type StageTransition } from 'src/engine/core-modules/propel-command/propel-stage';

export enum CommandKind {
  ASSIGNMENT = 'ASSIGNMENT',
  STAGE_ADVANCE = 'STAGE_ADVANCE',
}

export enum CommandStatus {
  APPLIED = 'APPLIED',
  REPLAYED = 'REPLAYED',
}

export interface ExecuteCommandInput {
  commandId: string;
  kind: CommandKind;
  payload: Record<string, unknown>;
}

export interface CommandReceipt {
  commandId: string;
  kind: CommandKind;
  status: CommandStatus;
  result: Record<string, unknown>;
  // Present only for a STAGE_ADVANCE command: the exact typed transition the
  // receipt committed. Null for every other kind.
  stageTransition: StageTransition | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

// Core record of a command that has been applied to the workspace. One row per
// commandId. The unique index on commandId is what makes replay safe: the second
// execution of the same commandId finds this row and writes nothing.
@Entity({ name: 'command_receipt', schema: 'core' })
@Index('IDX_COMMAND_RECEIPT_COMMAND_ID', ['commandId'], { unique: true })
export class CommandReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  commandId: string;

  @Column({ type: 'text', nullable: false })
  kind: string;

  @Column({ type: 'text', nullable: false, default: 'APPLIED' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  result: unknown;

  @Column({ type: 'jsonb', nullable: true })
  stageTransition: unknown;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
