import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { SecurityEventEntity } from 'src/engine/core-modules/security-event/security-event.entity';
import { SecurityEventService } from 'src/engine/core-modules/security-event/security-event.service';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';

const MY_SECURITY_EVENTS_LIMIT = 30;

// Account-scoped (UserAuthGuard, not WorkspaceAuthGuard) — mirrors UserResolver's
// `currentUser` query (user.resolver.ts) — these events aren't tied to a workspace.
@Resolver(() => SecurityEventEntity)
export class SecurityEventResolver {
  constructor(private readonly securityEventService: SecurityEventService) {}

  @Query(() => [SecurityEventEntity])
  @UseGuards(UserAuthGuard, NoPermissionGuard)
  async mySecurityEvents(
    @AuthUser() { id: userId }: AuthContextUser,
  ): Promise<SecurityEventEntity[]> {
    return this.securityEventService.findForUser(userId, {
      limit: MY_SECURITY_EVENTS_LIMIT,
    });
  }

  @Mutation(() => Boolean)
  @UseGuards(UserAuthGuard, NoPermissionGuard)
  async markSecurityEventsAsRead(
    @AuthUser() { id: userId }: AuthContextUser,
    @Args({ name: 'ids', type: () => [String] }) ids: string[],
  ): Promise<boolean> {
    await this.securityEventService.markAsRead(userId, ids);
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(UserAuthGuard, NoPermissionGuard)
  async markSecurityEventsAsUnread(
    @AuthUser() { id: userId }: AuthContextUser,
    @Args({ name: 'ids', type: () => [String] }) ids: string[],
  ): Promise<boolean> {
    await this.securityEventService.markAsUnread(userId, ids);
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(UserAuthGuard, NoPermissionGuard)
  async markAllSecurityEventsAsRead(
    @AuthUser() { id: userId }: AuthContextUser,
  ): Promise<boolean> {
    await this.securityEventService.markAllAsRead(userId);
    return true;
  }
}
