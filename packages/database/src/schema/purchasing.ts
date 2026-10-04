import {
  index,
  integer,
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean
} from 'drizzle-orm/pg-core';
import { money, primaryId, rate, timestamps } from './columns';
import { branches, tenants } from './tenant';
import { products, productVariants } from './catalog';
import { users } from './auth';

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
]);
export const supplierLedgerTypeEnum = pgEnum('supplier_ledger_type', [
  'PURCHASE',
  'PAYMENT',
  'RETURN',
  'ADJUSTMENT'
]);

export const suppliers = pgTable(
  'suppliers',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    contactName: varchar('contact_name', { length: 120 }),
    phone: varchar('phone', { length: 40 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    paymentTerms: integer('payment_terms_days').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [
    index('suppliers_tenant_idx').on(table.tenantId),
    uniqueIndex('suppliers_tenant_name_unique').on(table.tenantId, table.name)
  ]
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    number: varchar('number', { length: 32 }).notNull(),
    status: purchaseOrderStatusEnum('status').notNull().default('DRAFT'),
    orderDate: timestamp('order_date', { withTimezone: true }).defaultNow().notNull(),
    expectedDate: timestamp('expected_date', { withTimezone: true }),
    subtotal: money('subtotal').notNull().default('0'),
    taxTotal: money('tax_total').notNull().default('0'),
    total: money('total').notNull().default('0'),
    notes: varchar('notes', { length: 500 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps
  },
  (table) => [
    uniqueIndex('purchase_orders_tenant_number_unique').on(table.tenantId, table.number),
    index('purchase_orders_supplier_idx').on(table.supplierId, table.status),
    index('purchase_orders_branch_idx').on(table.branchId, table.createdAt)
  ]
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: primaryId(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    quantity: integer('quantity').notNull(),
    receivedQuantity: integer('received_quantity').notNull().default(0),
    unitCost: money('unit_cost').notNull(),
    taxRate: rate('tax_rate').notNull().default('0'),
    lineTotal: money('line_total').notNull(),
    createdAt: timestamps.createdAt
  },
  (table) => [index('purchase_order_items_po_idx').on(table.purchaseOrderId)]
);

export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 32 }).notNull(),
    notes: varchar('notes', { length: 500 }),
    receivedBy: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamps.createdAt
  },
  (table) => [
    uniqueIndex('goods_receipts_tenant_number_unique').on(table.tenantId, table.number),
    index('goods_receipts_po_idx').on(table.purchaseOrderId)
  ]
);

export const goodsReceiptItems = pgTable(
  'goods_receipt_items',
  {
    id: primaryId(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
    purchaseOrderItemId: uuid('purchase_order_item_id')
      .notNull()
      .references(() => purchaseOrderItems.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id'),
    quantity: integer('quantity').notNull(),
    unitCost: money('unit_cost').notNull()
  },
  (table) => [index('goods_receipt_items_receipt_idx').on(table.receiptId)]
);

export const supplierPayments = pgTable(
  'supplier_payments',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    method: varchar('method', { length: 30 }).notNull().default('CASH'),
    reference: varchar('reference', { length: 120 }),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamps.createdAt
  },
  (table) => [
    uniqueIndex('supplier_payments_tenant_idem_unique').on(table.tenantId, table.idempotencyKey),
    index('supplier_payments_supplier_idx').on(table.supplierId)
  ]
);

/** Append-only supplier ledger. Debit increases payable, credit reduces it. */
export const supplierLedgerEntries = pgTable(
  'supplier_ledger_entries',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    entryType: supplierLedgerTypeEnum('entry_type').notNull(),
    debit: money('debit').notNull().default('0'),
    credit: money('credit').notNull().default('0'),
    balanceAfter: money('balance_after').notNull().default('0'),
    reference: varchar('reference', { length: 120 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('supplier_ledger_supplier_idx').on(table.supplierId, table.createdAt)]
);

export const purchaseReturns = pgTable(
  'purchase_returns',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 32 }).notNull(),
    total: money('total').notNull().default('0'),
    reason: varchar('reason', { length: 300 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamps.createdAt
  },
  (table) => [uniqueIndex('purchase_returns_tenant_number_unique').on(table.tenantId, table.number)]
);

export const purchaseReturnItems = pgTable(
  'purchase_return_items',
  {
    id: primaryId(),
    returnId: uuid('return_id')
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id'),
    quantity: integer('quantity').notNull(),
    unitCost: money('unit_cost').notNull(),
    lineTotal: money('line_total').notNull()
  },
  (table) => [index('purchase_return_items_return_idx').on(table.returnId)]
);

export type SupplierRow = typeof suppliers.$inferSelect;
export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect;
