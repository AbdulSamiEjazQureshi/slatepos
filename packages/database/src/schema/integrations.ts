import {
  index,
  jsonb,
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps } from './columns';
import { branches, tenants } from './tenant';
import { orders } from './orders';

export const notificationChannelEnum = pgEnum('notification_channel', [
  'IN_APP',
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'PUSH'
]);
export const notificationStatusEnum = pgEnum('notification_status', [
  'PENDING',
  'SENT',
  'FAILED',
  'READ'
]);
export const webhookStatusEnum = pgEnum('webhook_status', ['RECEIVED', 'PROCESSED', 'FAILED']);
export const taxProviderEnum = pgEnum('tax_provider', ['INTERNAL', 'FBR', 'PRA']);
export const taxInvoiceStatusEnum = pgEnum('tax_invoice_status', [
  'PENDING',
  'SUBMITTED',
  'FAILED',
  'VOID'
]);

export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    channel: notificationChannelEnum('channel').notNull().default('IN_APP'),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    level: varchar('level', { length: 20 }).notNull().default('info'),
    status: notificationStatusEnum('status').notNull().default('PENDING'),
    provider: varchar('provider', { length: 40 }),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index('notifications_user_idx').on(table.userId, table.status, table.createdAt),
    index('notifications_tenant_idx').on(table.tenantId, table.createdAt)
  ]
);

/** Idempotent webhook processing ledger. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: primaryId(),
    provider: varchar('provider', { length: 60 }).notNull(),
    eventId: varchar('event_id', { length: 160 }).notNull(),
    signatureValid: varchar('signature_valid', { length: 5 }).notNull().default('true'),
    status: webhookStatusEnum('status').notNull().default('RECEIVED'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    error: text('error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex('webhook_events_provider_event_unique').on(table.provider, table.eventId)]
);

/** Tax authority submission references kept for reconciliation. */
export const taxInvoices = pgTable(
  'tax_invoices',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    provider: taxProviderEnum('provider').notNull().default('INTERNAL'),
    invoiceNumber: varchar('invoice_number', { length: 80 }).notNull(),
    status: taxInvoiceStatusEnum('status').notNull().default('PENDING'),
    taxTotal: money('tax_total').notNull().default('0'),
    providerReference: varchar('provider_reference', { length: 160 }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('tax_invoices_tenant_number_unique').on(table.tenantId, table.invoiceNumber),
    index('tax_invoices_order_idx').on(table.orderId)
  ]
);

export type NotificationRow = typeof notifications.$inferSelect;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type TaxInvoiceRow = typeof taxInvoices.$inferSelect;
