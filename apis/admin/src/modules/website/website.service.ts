import { and, asc, eq } from '@roms/database';
import {
  branches,
  categories,
  products,
  tenants,
  websitePages,
  websiteSettings
} from '@roms/database';
import { DEFAULT_TENANT_SETTINGS } from '@roms/contracts/settings';
import {
  brandingSchema,
  type Branding,
  type PageSection,
  type UpdateWebsiteSettingsInput
} from '@roms/contracts/website';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { createOrder } from '../orders/orders.service';
import type { CreateOrderInput } from '@roms/contracts/orders';
import type { RequestContext } from '../../lib/context';

const DEFAULT_BRAND: Branding = {
  logoUrl: null,
  primaryColor: '#111827',
  accentColor: '#f59e0b',
  fontFamily: 'Inter'
};

const ensureSettings = async (deps: AppDeps, tenantId: string) => {
  const rows = await deps.db
    .select()
    .from(websiteSettings)
    .where(eq(websiteSettings.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
};

export const getWebsiteSettings = async (deps: AppDeps, tenantId: string) => {
  const existing = await ensureSettings(deps, tenantId);
  if (existing) return existing;
  const tenant = await deps.db
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const inserted = await deps.db
    .insert(websiteSettings)
    .values({
      tenantId,
      slug: `${tenant[0]?.slug ?? 'site'}-web`,
      brand: DEFAULT_BRAND,
      sections: []
    })
    .returning();
  return inserted[0];
};

export const updateWebsiteSettings = async (
  deps: AppDeps,
  tenantId: string,
  input: UpdateWebsiteSettingsInput
) => {
  const current = await getWebsiteSettings(deps, tenantId);
  if (!current) throw new Error('Failed to load website settings');
  const brand = input.brand
    ? brandingSchema.parse({ ...(current.brand ?? DEFAULT_BRAND), ...input.brand })
    : current.brand;
  const updated = await deps.db
    .update(websiteSettings)
    .set({
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(input.brand ? { brand } : {}),
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle ?? null } : {}),
      ...(input.seoDescription !== undefined
        ? { seoDescription: input.seoDescription ?? null }
        : {}),
      ...(input.sections ? { sections: input.sections as PageSection[] } : {}),
      updatedAt: new Date()
    })
    .where(eq(websiteSettings.tenantId, tenantId))
    .returning();
  return updated[0];
};

export const listWebsitePages = async (deps: AppDeps, tenantId: string) =>
  deps.db
    .select()
    .from(websitePages)
    .where(eq(websitePages.tenantId, tenantId))
    .orderBy(asc(websitePages.sortOrder));

export const upsertWebsitePage = async (
  deps: AppDeps,
  tenantId: string,
  input: {
    slug: string;
    title: string;
    sortOrder: number;
    isPublished: boolean;
    sections: PageSection[];
  }
) => {
  const existing = await deps.db
    .select({ id: websitePages.id })
    .from(websitePages)
    .where(and(eq(websitePages.tenantId, tenantId), eq(websitePages.slug, input.slug)))
    .limit(1);
  if (existing[0]) {
    const updated = await deps.db
      .update(websitePages)
      .set({
        title: input.title,
        sortOrder: input.sortOrder,
        isPublished: input.isPublished,
        sections: input.sections,
        updatedAt: new Date()
      })
      .where(eq(websitePages.id, existing[0].id))
      .returning();
    return updated[0];
  }
  const inserted = await deps.db
    .insert(websitePages)
    .values({ tenantId, ...input })
    .returning();
  return inserted[0];
};

export const deleteWebsitePage = async (deps: AppDeps, tenantId: string, slug: string) => {
  const deleted = await deps.db
    .delete(websitePages)
    .where(and(eq(websitePages.tenantId, tenantId), eq(websitePages.slug, slug)))
    .returning({ id: websitePages.id });
  if (deleted.length === 0) throw AppError.notFound('Page not found');
  return { ok: true as const };
};

const resolvePublicTenant = async (deps: AppDeps, slug: string) => {
  const rows = await deps.db
    .select({
      tenantId: websiteSettings.tenantId,
      isPublished: websiteSettings.isPublished,
      brand: websiteSettings.brand,
      seoTitle: websiteSettings.seoTitle,
      seoDescription: websiteSettings.seoDescription,
      sections: websiteSettings.sections,
      name: tenants.name,
      settings: tenants.settings
    })
    .from(websiteSettings)
    .innerJoin(tenants, eq(tenants.id, websiteSettings.tenantId))
    .where(eq(websiteSettings.slug, slug))
    .limit(1);
  const site = rows[0];
  if (!site || !site.isPublished) throw AppError.notFound('Site not found');
  return site;
};

/** Public site payload — only explicitly public information. */
export const getPublicSite = async (deps: AppDeps, slug: string) => {
  const site = await resolvePublicTenant(deps, slug);
  const pages = await deps.db
    .select({ slug: websitePages.slug, title: websitePages.title, sections: websitePages.sections })
    .from(websitePages)
    .where(and(eq(websitePages.tenantId, site.tenantId), eq(websitePages.isPublished, true)))
    .orderBy(asc(websitePages.sortOrder));
  return {
    name: site.name,
    brand: site.brand ?? DEFAULT_BRAND,
    currency: site.settings?.currency ?? DEFAULT_TENANT_SETTINGS.currency,
    seo: { title: site.seoTitle, description: site.seoDescription },
    sections: site.sections,
    pages
  };
};

/** Public menu: categories + active products for the tenant's default branch. */
export const getPublicMenu = async (deps: AppDeps, slug: string) => {
  const site = await resolvePublicTenant(deps, slug);
  const [categoryRows, productRows] = await Promise.all([
    deps.db
      .select()
      .from(categories)
      .where(and(eq(categories.tenantId, site.tenantId), eq(categories.isActive, true)))
      .orderBy(asc(categories.sortOrder)),
    deps.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        imageUrl: products.imageUrl,
        categoryId: products.categoryId
      })
      .from(products)
      .where(
        and(
          eq(products.tenantId, site.tenantId),
          eq(products.status, 'ACTIVE'),
          eq(products.isAvailable, true)
        )
      )
      .orderBy(asc(products.name))
  ]);
  return {
    categories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description
    })),
    products: productRows
  };
};

/**
 * Public online order. The tenant/branch are resolved from the published site
 * slug — never trusted from the request body.
 */
export const placePublicOrder = async (deps: AppDeps, slug: string, input: CreateOrderInput) => {
  const site = await resolvePublicTenant(deps, slug);
  const branch = await deps.db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.tenantId, site.tenantId), eq(branches.isActive, true)))
    .orderBy(asc(branches.isDefault))
    .limit(1);
  const branchId = branch[0]?.id;
  if (!branchId) throw AppError.notFound('No branch available');

  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    userId: null,
    sessionId: null,
    tenantId: site.tenantId,
    branchId,
    isPlatformAdmin: false,
    roles: [],
    permissions: new Set(),
    ipAddress: null,
    userAgent: 'public-web'
  };
  // Public orders are never dine-in; the schema default may be DINE_IN.
  const type = input.type === 'DINE_IN' ? 'ONLINE' : input.type;
  return createOrder(deps, ctx, { ...input, type, branchId });
};
