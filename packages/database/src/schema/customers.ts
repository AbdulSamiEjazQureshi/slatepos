import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps } from './columns';
import { tenants } from './tenant';

export const customers = pgTable(
  'customers',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    email: varchar('email', { length: 255 }),
    notes: text('notes'),
    group: varchar('group', { length: 60 }),
    loyaltyPoints: integer('loyalty_points').notNull().default(0),
    walletBalance: money('wallet_balance').notNull().default('0'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('customers_tenant_phone_unique')
      .on(table.tenantId, table.phone)
      .where(sql`${table.phone} is not null`),
    index('customers_tenant_idx').on(table.tenantId),
    index('customers_name_idx').on(table.name)
  ]
);

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomerRow = typeof customers.$inferInsert;
