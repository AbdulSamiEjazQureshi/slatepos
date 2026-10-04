import { Elysia } from 'elysia';
import { createOrderSchema } from '@roms/contracts/orders';
import { updateWebsiteSettingsSchema, upsertWebsitePageSchema } from '@roms/contracts/website';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { securityPlugin } from '../../plugins/security';
import {
  deleteWebsitePage,
  getPublicMenu,
  getPublicSite,
  getWebsiteSettings,
  listWebsitePages,
  placePublicOrder,
  updateWebsiteSettings,
  upsertWebsitePage
} from './website.service';

export const websiteModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/website', tags: ['website'] })
    .use(securityPlugin(deps))
    .get('/settings', async ({ ctx }) => getWebsiteSettings(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'settings.read'
    })
    .patch(
      '/settings',
      async ({ ctx, body }) => updateWebsiteSettings(deps, requireTenantId(ctx), body),
      {
        requireTenant: true,
        requirePermission: 'settings.manage',
        body: updateWebsiteSettingsSchema
      }
    )
    .get('/pages', async ({ ctx }) => listWebsitePages(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'settings.read'
    })
    .put('/pages', async ({ ctx, body }) => upsertWebsitePage(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'settings.manage',
      body: upsertWebsitePageSchema
    })
    .delete(
      '/pages/:slug',
      async ({ ctx, params }) => deleteWebsitePage(deps, requireTenantId(ctx), params.slug),
      { requireTenant: true, requirePermission: 'settings.manage' }
    );

/** Public, unauthenticated endpoints for a tenant's online-ordering website. */
export const publicModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/public', tags: ['website'] })
    .use(securityPlugin(deps))
    .get('/site/:slug', async ({ params }) => getPublicSite(deps, params.slug), {
      detail: { summary: 'Public restaurant site content' }
    })
    .get('/site/:slug/menu', async ({ params }) => getPublicMenu(deps, params.slug), {
      detail: { summary: 'Public menu (categories and products)' }
    })
    .post(
      '/site/:slug/orders',
      async ({ params, body }) => placePublicOrder(deps, params.slug, body),
      {
        body: createOrderSchema,
        rateLimit: { max: 20, windowSeconds: 60 },
        detail: { summary: 'Place a public online order' }
      }
    );
