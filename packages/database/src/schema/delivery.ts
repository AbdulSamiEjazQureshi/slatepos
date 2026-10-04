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
import { orders } from './orders';

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'FAILED',
  'CANCELLED'
]);
export const settlementStatusEnum = pgEnum('settlement_status', ['OPEN', 'PAID']);

export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    fee: money('fee').notNull().default('0'),
    minOrder: money('min_order').notNull().default('0'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [index('delivery_zones_branch_idx').on(table.branchId)]
);

export const riders = pgTable(
  'riders',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    vehicle: varchar('vehicle', { length: 40 }),
    commissionRate: rate('commission_rate').notNull().default('0'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [index('riders_tenant_idx').on(table.tenantId)]
);

export const deliveries = pgTable(
  'deliveries',
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
    zoneId: uuid('zone_id').references(() => deliveryZones.id, { onDelete: 'set null' }),
    riderId: uuid('rider_id').references(() => riders.id, { onDelete: 'set null' }),
    status: deliveryStatusEnum('status').notNull().default('PENDING'),
    address: text('address'),
    fee: money('fee').notNull().default('0'),
    provider: varchar('provider', { length: 40 }).notNull().default('internal'),
    providerReference: varchar('provider_reference', { length: 160 }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('deliveries_order_unique').on(table.orderId),
    index('deliveries_rider_status_idx').on(table.riderId, table.status),
    index('deliveries_branch_created_idx').on(table.branchId, table.createdAt)
  ]
);

export const riderSettlements = pgTable(
  'rider_settlements',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'cascade' }),
    orderCount: integer('order_count').notNull().default(0),
    amount: money('amount').notNull().default('0'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    status: settlementStatusEnum('status').notNull().default('OPEN'),
    createdAt: timestamps.createdAt
  },
  (table) => [index('rider_settlements_rider_idx').on(table.riderId)]
);

export type DeliveryZoneRow = typeof deliveryZones.$inferSelect;
export type RiderRow = typeof riders.$inferSelect;
export type DeliveryRow = typeof deliveries.$inferSelect;
