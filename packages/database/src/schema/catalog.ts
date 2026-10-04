import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { money, primaryId, rate, timestamps } from './columns';
import { productStatusEnum } from './enums';
import { tenants } from './tenant';

export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [
    uniqueIndex('categories_tenant_name_unique').on(table.tenantId, table.name),
    index('categories_tenant_idx').on(table.tenantId)
  ]
);

export const products = pgTable(
  'products',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    sku: varchar('sku', { length: 64 }),
    barcode: varchar('barcode', { length: 64 }),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    price: money('price').notNull(),
    costPrice: money('cost_price'),
    taxRate: rate('tax_rate').notNull().default('0'),
    status: productStatusEnum('status').notNull().default('ACTIVE'),
    isAvailable: boolean('is_available').notNull().default(true),
    trackInventory: boolean('track_inventory').notNull().default(false),
    imageUrl: text('image_url'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('products_tenant_sku_unique')
      .on(table.tenantId, table.sku)
      .where(sql`${table.sku} is not null`),
    uniqueIndex('products_tenant_barcode_unique')
      .on(table.tenantId, table.barcode)
      .where(sql`${table.barcode} is not null`),
    index('products_tenant_status_idx').on(table.tenantId, table.status),
    index('products_category_idx').on(table.categoryId),
    index('products_name_idx').on(table.name)
  ]
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    sku: varchar('sku', { length: 64 }),
    barcode: varchar('barcode', { length: 64 }),
    price: money('price').notNull(),
    costPrice: money('cost_price'),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps
  },
  (table) => [
    index('product_variants_product_idx').on(table.productId),
    uniqueIndex('product_variants_tenant_sku_unique')
      .on(table.tenantId, table.sku)
      .where(sql`${table.sku} is not null`)
  ]
);

export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    minSelect: integer('min_select').notNull().default(0),
    maxSelect: integer('max_select').notNull().default(1),
    isRequired: boolean('is_required').notNull().default(false),
    ...timestamps
  },
  (table) => [index('modifier_groups_tenant_idx').on(table.tenantId)]
);

export const modifierOptions = pgTable(
  'modifier_options',
  {
    id: primaryId(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => modifierGroups.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    priceDelta: money('price_delta').notNull().default('0'),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamps.createdAt
  },
  (table) => [index('modifier_options_group_idx').on(table.groupId)]
);

export const productModifierGroups = pgTable(
  'product_modifier_groups',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => modifierGroups.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  (table) => [primaryKey({ columns: [table.productId, table.groupId] })]
);

export type CategoryRow = typeof categories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type ModifierGroupRow = typeof modifierGroups.$inferSelect;
export type ModifierOptionRow = typeof modifierOptions.$inferSelect;
