import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssignmentStepService } from 'src/engine/core-modules/propel-command/assignment-step.service';
import { AtomicCommandService } from 'src/engine/core-modules/propel-command/atomic-command.service';
import { CommandReceiptEntity } from 'src/engine/core-modules/propel-command/command-receipt.entity';
import { DurableEffectService } from 'src/engine/core-modules/propel-command/durable-effect.service';
import { EffectReceiptEntity } from 'src/engine/core-modules/propel-command/effect-receipt.entity';
import { PropelCommandController } from 'src/engine/core-modules/propel-command/propel-command.controller';
import { StageStepService } from 'src/engine/core-modules/propel-command/stage-step.service';
import { PropelRlsModule } from 'src/modules/propel-rls/propel-rls.module';
import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

@Module({
  imports: [
    WorkspaceCacheStorageModule,
    TokenModule,
    TypeOrmModule.forFeature([CommandReceiptEntity, EffectReceiptEntity]),
    // The command endpoints authorise through PropelTierService, the same tier
    // resolution the RLS layer uses.
    PropelRlsModule,
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
