import { index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps } from './columns';
import { cashDirectionEnum, paymentMethodEnum, paymentStatusEnum } from './enums';
import { branches, tenants } from './tenant';
import { orders } from './orders';

export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    method: paymentMethodEnum('method').notNull(),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    amount: money('amount').notNull(),
    refundedAmount: money('refunded_amount').notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull().default('PKR'),
    provider: varchar('provider', { length: 40 }).notNull().default('internal'),
    providerReference: varchar('provider_reference', { length: 160 }),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('payments_tenant_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    index('payments_order_idx').on(table.orderId),
    index('payments_branch_created_idx').on(table.branchId, table.createdAt)
  ]
);

export const refunds = pgTable(
  'refunds',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    reason: varchar('reason', { length: 200 }),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamps.createdAt
  },
  (table) => [
    uniqueIndex('refunds_tenant_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    index('refunds_payment_idx').on(table.paymentId)
  ]
);

/** Generic idempotency ledger for non-payment mutations. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 80 }).notNull(),
    key: varchar('key', { length: 120 }).notNull(),
    requestHash: varchar('request_hash', { length: 128 }).notNull(),
    response: jsonb('response').$type<unknown>(),
    createdAt: timestamps.createdAt
  },
  (table) => [uniqueIndex('idempotency_keys_unique').on(table.tenantId, table.scope, table.key)]
);

export const cashMovements = pgTable(
  'cash_movements',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    direction: cashDirectionEnum('direction').notNull(),
    amount: money('amount').notNull(),
    reason: varchar('reason', { length: 200 }).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamps.createdAt
  },
  (table) => [index('cash_movements_branch_created_idx').on(table.branchId, table.createdAt)]
);

export type PaymentRow = typeof payments.$inferSelect;
export type RefundRow = typeof refunds.$inferSelect;
export type CashMovementRow = typeof cashMovements.$inferSelect;
