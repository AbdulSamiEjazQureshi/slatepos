import { numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Every table uses a UUID primary key. */
export const primaryId = () => uuid('id').primaryKey().defaultRandom();

/** Monetary amounts: `numeric(14,4)`, never floating point. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

/** Ratios/percentages (tax, discount, service charge): `numeric(8,4)`. */
export const rate = (name: string) => numeric(name, { precision: 8, scale: 4 });

/** Shared audit columns. `updated_at` is maintained by the application layer. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
};
