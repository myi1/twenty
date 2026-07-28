import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, IsNull, Repository } from 'typeorm';

import {
  SecurityEventEntity,
  type SecurityEventType,
} from 'src/engine/core-modules/security-event/security-event.entity';

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(
    @InjectRepository(SecurityEventEntity)
    private readonly securityEventRepository: Repository<SecurityEventEntity>,
  ) {}

  // Best-effort, NEVER throws — mirrors notifyAgent()'s philosophy in propel-crm.
  // A notification write must never break login or a password change.
  async record(userId: string, eventType: SecurityEventType): Promise<void> {
    try {
      await this.securityEventRepository.insert({ userId, eventType });
    } catch (error) {
      this.logger.error(
        `Failed to record security event ${eventType} for user ${userId}: ${error}`,
      );
    }
  }

  async findForUser(
    userId: string,
    { limit }: { limit: number },
  ): Promise<SecurityEventEntity[]> {
    return this.securityEventRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async markAsRead(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.securityEventRepository.update(
      { userId, id: In(ids) },
      { readAt: new Date() },
    );
  }

  async markAsUnread(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.securityEventRepository.update(
      { userId, id: In(ids) },
      { readAt: null },
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.securityEventRepository.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
  }
}
