import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreatePropelCommandStage1776100000000
  implements MigrationInterface
{
  name = 'CreatePropelCommandStage1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The typed stage transition a STAGE_ADVANCE receipt committed. Null for
    // every other command kind.
    await queryRunner.query(
      `ALTER TABLE "core"."command_receipt" ADD "stageTransition" jsonb`,
    );

    // The stage step's own row, written inside the same transaction as the
    // receipt so both commit or both roll back together.
    await queryRunner.query(
      `CREATE TABLE "core"."command_stage_advance" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "commandId" text NOT NULL, "recordId" text NOT NULL, "fromStage" text NOT NULL, "toStage" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_command_stage_advance" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_COMMAND_STAGE_ADVANCE_COMMAND_ID" ON "core"."command_stage_advance" ("commandId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "core"."command_stage_advance"`);
    await queryRunner.query(
      `ALTER TABLE "core"."command_receipt" DROP COLUMN "stageTransition"`,
    );
  }
}
