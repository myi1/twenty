import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

import { IDField } from '@ptc-org/nestjs-query-graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

// Account-security events (login, password change, ...) — deliberately account-scoped
// (userId only, no workspaceId): these happen before/outside any tenant context, and
// must surface in the bell no matter which workspace the user is currently in. Kept
// separate from the per-workspace `notificationLog` custom object propel-crm owns —
// that object only exists because propel-crm's app-as-code created it; core engine
// code must not depend on a specific app's schema.
export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
}

registerEnumType(SecurityEventType, { name: 'SecurityEventType' });

@Entity({ name: 'securityEvent', schema: 'core' })
@ObjectType('SecurityEvent')
@Index('IDX_SECURITY_EVENT_USER_ID_CREATED_AT', ['userId', 'createdAt'])
export class SecurityEventEntity {
  @IDField(() => UUIDScalarType)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<UserEntity>;

  @Column({ type: 'uuid' })
  userId: string;

  @Field(() => SecurityEventType)
  @Column({ type: 'enum', enum: SecurityEventType })
  eventType: SecurityEventType;

  // Reserved for future context (e.g. the workspaceId a login happened against).
  // Unused today — no IP/device/location capture yet. Not exposed over GraphQL
  // (nothing reads it yet); add a `@Field` back if/when a consumer needs it.
  @Column('jsonb', { nullable: true })
  metadata: Record<string, unknown> | null;

  @Field(() => Date)
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field(() => Date, { nullable: true })
  @Column({ nullable: true, type: 'timestamptz' })
  readAt: Date | null;
}
