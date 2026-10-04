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
import { primaryId, timestamps } from './columns';
import { branches, tenants } from './tenant';
import { orders } from './orders';

export const kitchenTicketStatusEnum = pgEnum('kitchen_ticket_status', [
  'NEW',
  'PREPARING',
  'READY',
  'SERVED',
  'VOID'
]);

export const kitchenStations = pgTable(
  'kitchen_stations',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [index('kitchen_stations_branch_idx').on(table.branchId)]
);

/** One kitchen ticket per order (per branch). Drives the KDS board. */
export const kitchenTickets = pgTable(
  'kitchen_tickets',
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
    stationId: uuid('station_id').references(() => kitchenStations.id, { onDelete: 'set null' }),
    status: kitchenTicketStatusEnum('status').notNull().default('NEW'),
    priority: integer('priority').notNull().default(0),
    notes: text('notes'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex('kitchen_tickets_order_unique').on(table.orderId),
    index('kitchen_tickets_board_idx').on(table.branchId, table.status, table.createdAt)
  ]
);

export type KitchenStationRow = typeof kitchenStations.$inferSelect;
export type KitchenTicketRow = typeof kitchenTickets.$inferSelect;
