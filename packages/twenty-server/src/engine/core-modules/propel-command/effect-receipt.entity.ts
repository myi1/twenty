import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { type CommandKind } from 'src/engine/core-modules/propel-command/command-receipt.entity';

// A durable effect moves through two states. CLAIMED is committed before the
// step runs, so a process that dies mid-step leaves a resumable marker behind.
// APPLIED is committed in the same transaction as the step's own write, so the
// effect and its record are all-or-nothing.
export enum EffectStatus {
  CLAIMED = 'CLAIMED',
  APPLIED = 'APPLIED',
}

export interface EffectReceipt {
  commandId: string;
  kind: CommandKind;
  status: EffectStatus;
  result: Record<string, unknown>;
  claimedAt: string;
  appliedAt: string | null;
  createdAt: string;
}

// Durable counterpart of CommandReceiptEntity. One row per (workspaceId,
// commandId): the composite unique index is the claim, so two callers racing on
// the same id can never both win a fresh claim, and a resumed id finds the row
// the crashed attempt left behind. A commandId is only unique WITHIN a
// workspace, so the bare commandId must never be the key: otherwise a second
// workspace replaying a known id would read the first workspace's receipt.
@Entity({ name: 'effect_receipt', schema: 'core' })
@Index(
  'IDX_EFFECT_RECEIPT_WORKSPACE_COMMAND_ID',
  ['workspaceId', 'commandId'],
  { unique: true },
)
export class EffectReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false })
  workspaceId: string;

  @Column({ type: 'text', nullable: false })
  commandId: string;

  @Column({ type: 'text', nullable: false })
  kind: string;

  @Column({ type: 'text', nullable: false, default: EffectStatus.CLAIMED })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  result: unknown;

  @Column({ type: 'timestamptz', nullable: false })
  claimedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
