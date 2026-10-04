import { integer, pgTable, primaryKey, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

/** Generic per-tenant sequential document numbers (PO, GRN, RET, JRN, ...). */
export const documentCounters = pgTable(
  'document_counters',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 40 }).notNull(),
    nextValue: integer('next_value').notNull().default(1)
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.scope] })]
);

export type DocumentCounterRow = typeof documentCounters.$inferSelect;
