import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWorkspaceIdToStageAdvance1776500000000
  implements MigrationInterface
{
  name = 'AddWorkspaceIdToStageAdvance1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // command_assignment already carries workspaceId (migration
    // 1776300000000); the stage-advance row written by the same engine must
    // too, so rows sharing a commandId across workspaces are distinguishable.
    await queryRunner.query(
      `ALTER TABLE "core"."command_stage_advance" ADD "workspaceId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."command_stage_advance" ALTER COLUMN "workspaceId" DROP DEFAULT`,
    );

    await queryRunner.query(
      `DROP INDEX "core"."IDX_COMMAND_STAGE_ADVANCE_COMMAND_ID"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_COMMAND_STAGE_ADVANCE_WORKSPACE_COMMAND_ID" ON "core"."command_stage_advance" ("workspaceId", "commandId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "core"."IDX_COMMAND_STAGE_ADVANCE_WORKSPACE_COMMAND_ID"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_COMMAND_STAGE_ADVANCE_COMMAND_ID" ON "core"."command_stage_advance" ("commandId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."command_stage_advance" DROP COLUMN "workspaceId"`,
    );
  }
}
