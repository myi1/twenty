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
}

export interface ExecuteCommandInput {
  // The workspace the command is applied to. It is part of the command's
  // identity: a commandId is only unique WITHIN a workspace, so the receipt
  // dedupe key is (workspaceId, commandId). Without it, a second workspace
  // replaying a known commandId would be handed the first workspace's receipt.
  workspaceId: string;
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
// (workspaceId, commandId). The composite unique index is what makes replay
// safe: the second execution of the same commandId in the SAME workspace finds
// this row and writes nothing, while another workspace's commandId is a
// different command entirely.
@Entity({ name: 'command_receipt', schema: 'core' })
@Index('IDX_COMMAND_RECEIPT_WORKSPACE_COMMAND_ID', ['workspaceId', 'commandId'], {
  unique: true,
})
export class CommandReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false })
  workspaceId: string;

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
