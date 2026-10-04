import { boolean, index, jsonb, pgTable, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import type { TenantSettings } from '@roms/contracts/settings';
import { DEFAULT_TENANT_SETTINGS } from '@roms/contracts/settings';
import { primaryId, timestamps } from './columns';
import { tenantStatusEnum } from './enums';

export const tenants = pgTable(
  'tenants',
  {
    id: primaryId(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    legalName: varchar('legal_name', { length: 200 }),
    status: tenantStatusEnum('status').notNull().default('ACTIVE'),
    settings: jsonb('settings').$type<TenantSettings>().notNull().default(DEFAULT_TENANT_SETTINGS),
    ...timestamps
  },
  (table) => [
    unique('tenants_slug_unique').on(table.slug),
    index('tenants_status_idx').on(table.status)
  ]
);

export const branches = pgTable(
  'branches',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    address: text('address'),
    phone: varchar('phone', { length: 40 }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Karachi'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [
    unique('branches_tenant_code_unique').on(table.tenantId, table.code),
    index('branches_tenant_idx').on(table.tenantId)
  ]
);

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
export type BranchRow = typeof branches.$inferSelect;
export type NewBranchRow = typeof branches.$inferInsert;
