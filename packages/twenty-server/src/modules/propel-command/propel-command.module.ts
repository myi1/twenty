import { Module } from '@nestjs/common';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { AtomicCommandService } from 'src/modules/propel-command/atomic-command.service';
import { PropelCommandController } from 'src/modules/propel-command/propel-command.controller';

/**
 * C0 SPIKE module. Narrow by construction: one controller, one service, no ORM
 * behaviour change anywhere else. GlobalWorkspaceOrmManager is globally exported
 * by TwentyORMModule, so it needs no import here.
 *
 * The endpoint is 404 unless PROPEL_C0_SPIKE_ENABLED=true (see the controller).
 */
@Module({
  imports: [AuthModule, WorkspaceCacheStorageModule],
  controllers: [PropelCommandController],
  providers: [AtomicCommandService],
})
export class PropelCommandModule {}
