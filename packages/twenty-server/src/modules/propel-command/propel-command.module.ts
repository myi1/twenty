import { Module } from '@nestjs/common';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { PropelTierService } from 'src/modules/propel-rls/propel-tier.service';
import { AtomicCommandService } from 'src/modules/propel-command/atomic-command.service';
import { PropelCommandController } from 'src/modules/propel-command/propel-command.controller';

/**
 * C0 SPIKE module. Narrow by construction: one controller, one service, no ORM
 * behaviour change anywhere else. GlobalWorkspaceOrmManager is globally exported
 * by TwentyORMModule, so it needs no import here.
 *
 * PropelTierService is PROVIDED here rather than imported from PropelRlsModule,
 * matching the precedent in navigation-menu-item.module.ts, to keep the DI graph
 * flat. It is the gate that already decides MANAGER vs AGENT for every RLS hook
 * in this engine; the command reuses it rather than inventing a second rule that
 * could disagree with the first.
 *
 * The endpoint is 404 unless PROPEL_C0_SPIKE_ENABLED=true (see the controller).
 */
@Module({
  imports: [AuthModule, WorkspaceCacheStorageModule, RoleModule, UserRoleModule],
  controllers: [PropelCommandController],
  providers: [AtomicCommandService, PropelTierService],
})
export class PropelCommandModule {}
