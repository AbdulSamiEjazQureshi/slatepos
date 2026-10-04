import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps } from './columns';
import { stockMovementTypeEnum } from './enums';
import { branches, tenants } from './tenant';
import { products, productVariants } from './catalog';

export const stockLevels = pgTable(
  'stock_levels',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(0),
    reorderPoint: integer('reorder_point').notNull().default(0),
    ...timestamps
  },
  (table) => [
    // Two partial unique indexes because Postgres treats NULLs as distinct.
    uniqueIndex('stock_levels_branch_product_unique')
      .on(table.branchId, table.productId)
      .where(sql`${table.variantId} is null`),
    uniqueIndex('stock_levels_branch_product_variant_unique')
      .on(table.branchId, table.productId, table.variantId)
      .where(sql`${table.variantId} is not null`),
    index('stock_levels_tenant_idx').on(table.tenantId)
  ]
);

/** Append-only ledger. Every stock change creates a row here. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
    movementType: stockMovementTypeEnum('movement_type').notNull(),
    quantityDelta: integer('quantity_delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    unitCost: money('unit_cost'),
    reason: varchar('reason', { length: 200 }).notNull(),
    reference: varchar('reference', { length: 120 }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('stock_movements_branch_product_idx').on(
      table.branchId,
      table.productId,
      table.createdAt
    ),
    index('stock_movements_reference_idx').on(table.reference)
  ]
);

export type StockLevelRow = typeof stockLevels.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
