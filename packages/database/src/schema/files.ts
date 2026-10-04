import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { tenants } from './tenant';

/** File metadata. Bytes live in the storage provider, not in PostgreSQL. */
export const files = pgTable(
  'files',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    storageKey: varchar('storage_key', { length: 300 }).notNull(),
    provider: varchar('provider', { length: 30 }).notNull().default('local'),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    size: integer('size').notNull().default(0),
    originalName: varchar('original_name', { length: 255 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('files_storage_key_unique').on(table.storageKey),
    index('files_tenant_idx').on(table.tenantId, table.createdAt)
  ]
);

export const tableMerges = pgTable(
  'table_merges',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    primaryTableId: uuid('primary_table_id').notNull(),
    mergedTableId: uuid('merged_table_id').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('table_merges_primary_idx').on(table.primaryTableId)]
);

export type FileRow = typeof files.$inferSelect;
export type TableMergeRow = typeof tableMerges.$inferSelect;
