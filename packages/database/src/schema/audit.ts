import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId } from './columns';
import { branches, tenants } from './tenant';

/**
 * Append-only audit trail. Never stores secrets, tokens or card data.
 * There is intentionally no `updatedAt` — audit rows are immutable.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    userId: uuid('user_id'),
    action: varchar('action', { length: 80 }).notNull(),
    entity: varchar('entity', { length: 80 }).notNull(),
    entityId: varchar('entity_id', { length: 80 }),
    oldValues: jsonb('old_values').$type<Record<string, unknown>>(),
    newValues: jsonb('new_values').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 400 }),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('audit_logs_entity_idx').on(table.entity, table.entityId),
    index('audit_logs_user_idx').on(table.userId)
  ]
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
