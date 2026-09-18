import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreatePropelCommand1776000000000 implements MigrationInterface {
  name = 'CreatePropelCommand1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "core"."command_receipt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "commandId" text NOT NULL, "kind" text NOT NULL, "status" text NOT NULL DEFAULT 'APPLIED', "result" jsonb, "acknowledgedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_command_receipt" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_COMMAND_RECEIPT_COMMAND_ID" ON "core"."command_receipt" ("commandId")`,
    );

    // The assignment step's own row, written inside the same transaction as the
    // receipt so both commit or both roll back together.
    await queryRunner.query(
      `CREATE TABLE "core"."command_assignment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "commandId" text NOT NULL, "recordId" text NOT NULL, "assigneeWorkspaceMemberId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_command_assignment" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_COMMAND_ASSIGNMENT_COMMAND_ID" ON "core"."command_assignment" ("commandId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "core"."command_assignment"`);
    await queryRunner.query(`DROP TABLE "core"."command_receipt"`);
  }
}
