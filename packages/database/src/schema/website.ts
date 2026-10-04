import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
  text
} from 'drizzle-orm/pg-core';
import type { Branding, PageSection } from '@roms/contracts/website';
import { primaryId, timestamps } from './columns';
import { tenants } from './tenant';

/** Per-tenant public website configuration and structured layout sections. */
export const websiteSettings = pgTable(
  'website_settings',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 64 }).notNull(),
    isPublished: boolean('is_published').notNull().default(false),
    brand: jsonb('brand').$type<Branding>(),
    seoTitle: varchar('seo_title', { length: 160 }),
    seoDescription: text('seo_description'),
    sections: jsonb('sections').$type<PageSection[]>().notNull().default([]),
    ...timestamps
  },
  (table) => [
    uniqueIndex('website_settings_tenant_unique').on(table.tenantId),
    uniqueIndex('website_settings_slug_unique').on(table.slug),
    index('website_settings_published_idx').on(table.isPublished)
  ]
);

export const websitePages = pgTable(
  'website_pages',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 80 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isPublished: boolean('is_published').notNull().default(true),
    sections: jsonb('sections').$type<PageSection[]>().notNull().default([]),
    ...timestamps
  },
  (table) => [uniqueIndex('website_pages_tenant_slug_unique').on(table.tenantId, table.slug)]
);

export type WebsiteSettingsRow = typeof websiteSettings.$inferSelect;
export type WebsitePageRow = typeof websitePages.$inferSelect;
