import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWorkspaceIdToEffectReceipt1776400000000
  implements MigrationInterface
{
  name = 'AddWorkspaceIdToEffectReceipt1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A commandId is only unique within a workspace, so the durable effect
    // claim must be keyed by (workspaceId, commandId) exactly like
    // command_receipt. Without workspaceId, a second workspace replaying a
    // known commandId would be handed the first workspace's receipt and its
    // own command would permanently no-op. The zero-uuid default backfills
    // any pre-existing rows before it is dropped again.
    await queryRunner.query(
      `ALTER TABLE "core"."effect_receipt" ADD "workspaceId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."effect_receipt" ALTER COLUMN "workspaceId" DROP DEFAULT`,
    );

    await queryRunner.query(
      `DROP INDEX "core"."IDX_EFFECT_RECEIPT_COMMAND_ID"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_EFFECT_RECEIPT_WORKSPACE_COMMAND_ID" ON "core"."effect_receipt" ("workspaceId", "commandId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "core"."IDX_EFFECT_RECEIPT_WORKSPACE_COMMAND_ID"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_EFFECT_RECEIPT_COMMAND_ID" ON "core"."effect_receipt" ("commandId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."effect_receipt" DROP COLUMN "workspaceId"`,
    );
  }
}
