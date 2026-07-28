import { Injectable, Logger } from '@nestjs/common';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { type SecurityEventType } from 'src/engine/core-modules/security-event/security-event.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

// Fires the WhatsApp leg for a security event by calling propel-crm's
// security-event-notify-route (a separate deploy — not an npm dependency of this
// package), which runs notifyAgent() internally. Best-effort, NEVER throws — same
// non-blocking guarantee as SecurityEventService.record(): a WhatsApp ping must
// never break login or a password change. Silently a no-op until
// SECURITY_EVENT_NOTIFY_URL is configured (mirrors how voice-service integration
// is a no-op until VOICE_SERVICE_URL is set on the propel-crm side).
@Injectable()
export class SecurityEventWhatsappNotifierService {
  private readonly logger = new Logger(SecurityEventWhatsappNotifierService.name);

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly secureHttpClientService: SecureHttpClientService,
  ) {}

  async notify(
    workspaceMemberId: string | null,
    eventType: SecurityEventType,
  ): Promise<void> {
    if (!workspaceMemberId) {
      return;
    }

    const baseUrl = this.twentyConfigService.get('SECURITY_EVENT_NOTIFY_URL');
    if (!baseUrl) {
      return;
    }
    const key = this.twentyConfigService.get('SECURITY_EVENT_NOTIFY_KEY');

    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/notify/security-event${
        key ? `?k=${encodeURIComponent(key)}` : ''
      }`;
      const httpClient = this.secureHttpClientService.getInternalHttpClient();

      await httpClient.post(url, { workspaceMemberId, eventType });
    } catch (error) {
      this.logger.error(
        `Failed to notify security event ${eventType} for workspaceMember ${workspaceMemberId}: ${error}`,
      );
    }
  }
}
