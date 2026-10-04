import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { otpPurposeEnum, userStatusEnum } from './enums';
import { branches, tenants } from './tenant';

/** Verify/refresh/reset token kinds stored as hashes. */
export const VERIFICATION_TOKEN_TYPES = ['PASSWORD_RESET', 'EMAIL_VERIFICATION'] as const;
export type VerificationTokenType = (typeof VERIFICATION_TOKEN_TYPES)[number];

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    unique('users_email_unique').on(table.email),
    index('users_tenant_idx').on(table.tenantId),
    index('users_status_idx').on(table.status)
  ]
);

export const roles = pgTable(
  'roles',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    description: varchar('description', { length: 200 }),
    isSystem: boolean('is_system').notNull().default(false),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    ...timestamps
  },
  (table) => [unique('roles_tenant_name_unique').on(table.tenantId, table.name)]
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_idx').on(table.roleId)
  ]
);

export const userBranches = pgTable(
  'user_branches',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.branchId] }),
    index('user_branches_branch_idx').on(table.branchId)
  ]
);

/** Refresh-token sessions. Only a hash of the refresh token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    userAgent: varchar('user_agent', { length: 400 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBySessionId: uuid('replaced_by_session_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    unique('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt)
  ]
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).$type<VerificationTokenType>().notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    unique('verification_tokens_hash_unique').on(table.tokenHash),
    index('verification_tokens_user_type_idx').on(table.userId, table.type)
  ]
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: primaryId(),
    identifier: varchar('identifier', { length: 200 }).notNull(),
    purpose: otpPurposeEnum('purpose').notNull(),
    codeHash: varchar('code_hash', { length: 128 }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('otp_identifier_purpose_idx').on(table.identifier, table.purpose)]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type RoleRow = typeof roles.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
