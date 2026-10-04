import {
  index,
  integer,
  numeric,
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
import { products } from './catalog';
import { users } from './auth';

export const recipeStatusEnum = pgEnum('recipe_status', ['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const productionStatusEnum = pgEnum('production_status', [
  'PLANNED',
  'COMPLETED',
  'CANCELLED'
]);

/**
 * A recipe version. Once a version has been used to produce stock it is never
 * mutated — a new version is created instead, preserving historical costing.
 */
export const recipes = pgTable(
  'recipes',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    version: integer('version').notNull().default(1),
    status: recipeStatusEnum('status').notNull().default('DRAFT'),
    yieldQuantity: numeric('yield_quantity', { precision: 14, scale: 4 }).notNull().default('1'),
    yieldUnit: varchar('yield_unit', { length: 20 }).notNull().default('unit'),
    theoreticalCost: money('theoretical_cost').notNull().default('0'),
    isLocked: boolean('is_locked').notNull().default(false),
    notes: text('notes'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('recipes_tenant_product_version_unique').on(
      table.tenantId,
      table.productId,
      table.version
    ),
    index('recipes_tenant_idx').on(table.tenantId)
  ]
);

export const recipeItems = pgTable(
  'recipe_items',
  {
    id: primaryId(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    componentProductId: uuid('component_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull(),
    unit: varchar('unit', { length: 20 }).notNull().default('unit'),
    wastageRate: rate('wastage_rate').notNull().default('0'),
    unitCost: money('unit_cost').notNull().default('0'),
    createdAt: timestamps.createdAt
  },
  (table) => [index('recipe_items_recipe_idx').on(table.recipeId)]
);

export const productionRuns = pgTable(
  'production_runs',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'restrict' }),
    outputProductId: uuid('output_product_id').notNull(),
    quantity: integer('quantity').notNull(),
    status: productionStatusEnum('status').notNull().default('PLANNED'),
    actualCost: money('actual_cost').notNull().default('0'),
    producedAt: timestamp('produced_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps
  },
  (table) => [index('production_runs_branch_idx').on(table.branchId, table.createdAt)]
);

export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeItemRow = typeof recipeItems.$inferSelect;
export type ProductionRunRow = typeof productionRuns.$inferSelect;
