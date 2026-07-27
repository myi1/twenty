import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { SecurityEventEntity } from 'src/engine/core-modules/security-event/security-event.entity';
import { SecurityEventResolver } from 'src/engine/core-modules/security-event/security-event.resolver';
import { SecurityEventService } from 'src/engine/core-modules/security-event/security-event.service';
import { SecurityEventWhatsappNotifierService } from 'src/engine/core-modules/security-event/security-event-whatsapp-notifier.service';

@Module({
  imports: [TypeOrmModule.forFeature([SecurityEventEntity]), SecureHttpClientModule],
  providers: [
    SecurityEventService,
    SecurityEventResolver,
    SecurityEventWhatsappNotifierService,
  ],
  exports: [SecurityEventService, SecurityEventWhatsappNotifierService],
})
export class SecurityEventModule {}
