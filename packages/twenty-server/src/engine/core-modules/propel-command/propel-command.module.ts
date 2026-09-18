import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import { AtomicCommandService } from 'src/engine/core-modules/propel-command/atomic-command.service';
import { CommandReceiptEntity } from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { DurableEffectService } from 'src/engine/core-modules/propel-command/durable-effect.service';
import { EffectReceiptEntity } from 'src/engine/core-modules/propel-command/effect-receipt.entity';
import { PropelCommandController } from 'src/engine/core-modules/propel-command/propel-command.controller';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';
import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommandReceiptEntity, EffectReceiptEntity]),
    RoleModule,
    UserRoleModule,
  ],
  controllers: [PropelCommandController],
  providers: [
    AtomicCommandService,
    DurableEffectService,
    AssignmentStepService,
    StageStepService,
  ],
  exports: [AtomicCommandService, DurableEffectService],
})
export class PropelCommandModule {}
