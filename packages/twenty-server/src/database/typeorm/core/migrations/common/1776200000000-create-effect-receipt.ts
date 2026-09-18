import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateEffectReceipt1776200000000 implements MigrationInterface {
  name = 'CreateEffectReceipt1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Durable, two-phase record of an effect. CLAIMED is committed before the
    // step runs; APPLIED is committed in the same transaction as the step's own
    // write. The unique commandId index is the claim: it stops two callers
    // racing on the same id and lets a crashed attempt be resumed by id.
    await queryRunner.query(
      `CREATE TABLE "core"."effect_receipt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "commandId" text NOT NULL, "kind" text NOT NULL, "status" text NOT NULL DEFAULT 'CLAIMED', "result" jsonb, "claimedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "appliedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_effect_receipt" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_EFFECT_RECEIPT_COMMAND_ID" ON "core"."effect_receipt" ("commandId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "core"."effect_receipt"`);
  }
}
