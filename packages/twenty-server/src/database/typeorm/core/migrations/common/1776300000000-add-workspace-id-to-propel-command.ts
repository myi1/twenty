import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWorkspaceIdToPropelCommand1776300000000
  implements MigrationInterface
{
  name = 'AddWorkspaceIdToPropelCommand1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A commandId is only unique within a workspace. Without workspaceId in the
    // dedupe key, a second workspace replaying a known commandId would be handed
    // the first workspace's receipt (false ACK + result leak) and its own command
    // would silently no-op. The zero-uuid default backfills any pre-existing rows
    // before it is dropped again.
    await queryRunner.query(
      `ALTER TABLE "core"."command_receipt" ADD "workspaceId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."command_receipt" ALTER COLUMN "workspaceId" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."command_assignment" ADD "workspaceId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."command_assignment" ALTER COLUMN "workspaceId" DROP DEFAULT`,
    );

    await queryRunner.query(
      `DROP INDEX "core"."IDX_COMMAND_RECEIPT_COMMAND_ID"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_COMMAND_RECEIPT_WORKSPACE_COMMAND_ID" ON "core"."command_receipt" ("workspaceId", "commandId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_COMMAND_ASSIGNMENT_WORKSPACE_COMMAND_ID" ON "core"."command_assignment" ("workspaceId", "commandId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "core"."IDX_COMMAND_ASSIGNMENT_WORKSPACE_COMMAND_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX "core"."IDX_COMMAND_RECEIPT_WORKSPACE_COMMAND_ID"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_COMMAND_RECEIPT_COMMAND_ID" ON "core"."command_receipt" ("commandId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."command_assignment" DROP COLUMN "workspaceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."command_receipt" DROP COLUMN "workspaceId"`,
    );
  }
}
