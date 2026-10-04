import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  pgEnum,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { money, primaryId, rate, timestamps } from './columns';
import { tenants } from './tenant';

export const promotionTypeEnum = pgEnum('promotion_type', ['PERCENT', 'FIXED', 'BOGO']);

/**
 * Server-side promotions. Eligibility and the discount amount are always
 * evaluated on the backend — a client-computed discount is never trusted.
 */
export const promotions = pgTable(
  'promotions',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    type: promotionTypeEnum('type').notNull().default('PERCENT'),
    /** Percentage (e.g. "0.10") or fixed amount, interpreted by `type`. */
    value: rate('value').notNull().default('0'),
    code: varchar('code', { length: 40 }),
    minOrder: money('min_order').notNull().default('0'),
    maxDiscount: money('max_discount'),
    branchIds: jsonb('branch_ids').$type<string[]>().notNull().default([]),
    productIds: jsonb('product_ids').$type<string[]>().notNull().default([]),
    categoryIds: jsonb('category_ids').$type<string[]>().notNull().default([]),
    customerGroup: varchar('customer_group', { length: 60 }),
    usageLimit: integer('usage_limit'),
    usedCount: integer('used_count').notNull().default(0),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [
    uniqueIndex('promotions_tenant_code_unique')
      .on(table.tenantId, table.code)
      .where(sql`${table.code} is not null`),
    index('promotions_tenant_active_idx').on(table.tenantId, table.isActive)
  ]
);

export type PromotionRow = typeof promotions.$inferSelect;
export type NewPromotionRow = typeof promotions.$inferInsert;
