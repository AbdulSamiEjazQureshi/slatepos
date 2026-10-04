import { boolean, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './columns';
import { tableStatusEnum } from './enums';
import { branches, tenants } from './tenant';
import { customers } from './customers';

export const floors = pgTable(
  'floors',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps
  },
  (table) => [index('floors_branch_idx').on(table.branchId)]
);

export const restaurantTables = pgTable(
  'restaurant_tables',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    floorId: uuid('floor_id').references(() => floors.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 40 }).notNull(),
    capacity: integer('capacity').notNull().default(2),
    status: tableStatusEnum('status').notNull().default('AVAILABLE'),
    positionX: integer('position_x').notNull().default(0),
    positionY: integer('position_y').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [
    index('restaurant_tables_branch_idx').on(table.branchId, table.status),
    index('restaurant_tables_floor_idx').on(table.floorId)
  ]
);

export const RESERVATION_STATUSES = [
  'BOOKED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const reservations = pgTable(
  'reservations',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    partySize: integer('party_size').notNull().default(2),
    reservedFrom: timestamp('reserved_from', { withTimezone: true }).notNull(),
    reservedTo: timestamp('reserved_to', { withTimezone: true }),
    status: varchar('status', { length: 20 }).notNull().default('BOOKED'),
    notes: varchar('notes', { length: 300 }),
    ...timestamps
  },
  (table) => [index('reservations_branch_from_idx').on(table.branchId, table.reservedFrom)]
);

export type FloorRow = typeof floors.$inferSelect;
export type RestaurantTableRow = typeof restaurantTables.$inferSelect;
