import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.9.0', 1785152244467)
export class AddSecurityEventFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TYPE "core"."securityEvent_eventtype_enum" AS ENUM(\'LOGIN_SUCCESS\', \'PASSWORD_CHANGED\')');
    await queryRunner.query('CREATE TABLE "core"."securityEvent" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "eventType" "core"."securityEvent_eventtype_enum" NOT NULL, "metadata" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "readAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_65f998b7fe572ae99f785af1b3a" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_SECURITY_EVENT_USER_ID_CREATED_AT" ON "core"."securityEvent" ("userId", "createdAt") ');
    await queryRunner.query('ALTER TABLE "core"."securityEvent" ADD CONSTRAINT "FK_2e2e8f10bf9f96f862892f9247e" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."securityEvent" DROP CONSTRAINT "FK_2e2e8f10bf9f96f862892f9247e"');
    await queryRunner.query('DROP INDEX "core"."IDX_SECURITY_EVENT_USER_ID_CREATED_AT"');
    await queryRunner.query('DROP TABLE "core"."securityEvent"');
    await queryRunner.query('DROP TYPE "core"."securityEvent_eventtype_enum"');
  }
}
