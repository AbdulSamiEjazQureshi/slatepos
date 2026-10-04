import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { money, primaryId, rate, timestamps } from './columns';
import { discountTypeEnum, orderItemStatusEnum, orderStatusEnum, orderTypeEnum } from './enums';
import { branches, tenants } from './tenant';
import { products, productVariants } from './catalog';
import { customers } from './customers';
import { restaurantTables } from './tables';

/** Per-branch, per-tenant order number counter (updated atomically). */
export const orderCounters = pgTable(
  'order_counters',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    nextValue: integer('next_value').notNull().default(1)
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.branchId] })]
);

export const orders = pgTable(
  'orders',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 32 }).notNull(),
    type: orderTypeEnum('type').notNull().default('DINE_IN'),
    status: orderStatusEnum('status').notNull().default('DRAFT'),
    tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    cashierId: uuid('cashier_id'),
    subtotal: money('subtotal').notNull().default('0'),
    discountType: discountTypeEnum('discount_type'),
    discountValue: rate('discount_value'),
    discountTotal: money('discount_total').notNull().default('0'),
    taxTotal: money('tax_total').notNull().default('0'),
    serviceCharge: money('service_charge').notNull().default('0'),
    tip: money('tip').notNull().default('0'),
    deliveryFee: money('delivery_fee').notNull().default('0'),
    grandTotal: money('grand_total').notNull().default('0'),
    notes: varchar('notes', { length: 500 }),
    version: integer('version').notNull().default(0),
    idempotencyKey: varchar('idempotency_key', { length: 120 }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: varchar('cancel_reason', { length: 200 }),
    ...timestamps
  },
  (table) => [
    uniqueIndex('orders_tenant_number_unique').on(table.tenantId, table.number),
    uniqueIndex('orders_idempotency_unique')
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('orders_branch_status_created_idx').on(table.branchId, table.status, table.createdAt),
    index('orders_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('orders_customer_idx').on(table.customerId)
  ]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: primaryId(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: money('unit_price').notNull(),
    taxRate: rate('tax_rate').notNull().default('0'),
    lineSubtotal: money('line_subtotal').notNull(),
    discountAmount: money('discount_amount').notNull().default('0'),
    taxAmount: money('tax_amount').notNull().default('0'),
    lineTotal: money('line_total').notNull(),
    status: orderItemStatusEnum('status').notNull().default('PENDING'),
    notes: varchar('notes', { length: 300 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamps.createdAt
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId),
    index('order_items_branch_status_idx').on(table.branchId, table.status)
  ]
);

export const orderItemModifiers = pgTable(
  'order_item_modifiers',
  {
    id: primaryId(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    modifierOptionId: uuid('modifier_option_id'),
    name: varchar('name', { length: 80 }).notNull(),
    priceDelta: money('price_delta').notNull().default('0'),
    quantity: integer('quantity').notNull().default(1)
  },
  (table) => [index('order_item_modifiers_item_idx').on(table.orderItemId)]
);

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type OrderItemModifierRow = typeof orderItemModifiers.$inferSelect;
