import { Elysia } from 'elysia';
import { z } from 'zod';
import {
  createProductSchema,
  listProductsQuerySchema,
  productSchema,
  updateProductSchema
} from '@roms/contracts/catalog';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import {
  archiveProduct,
  createProduct,
  getProduct,
  listProducts,
  searchProducts,
  updateProduct
} from './products.service';

const searchQuery = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const productsModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/products', tags: ['catalog'] })
    .use(authPlugin(deps))
    .get(
      '/',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        return listProducts(deps, tenantId, query);
      },
      {
        requireTenant: true,
        requirePermission: 'products.read',
        query: listProductsQuerySchema,
        detail: { summary: 'List products (paginated, filterable, searchable)' }
      }
    )
    .post(
      '/',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const product = await createProduct(deps, tenantId, body);
        await recordAudit(deps.db, ctx, {
          action: 'product.created',
          entity: 'product',
          entityId: product.id,
          newValues: { name: product.name, price: product.price }
        });
        return product;
      },
      {
        requireTenant: true,
        requirePermission: 'products.create',
        body: createProductSchema,
        response: { 200: productSchema },
        detail: { summary: 'Create a product with variants and modifier groups' }
      }
    )
    .get(
      '/search',
      async ({ ctx, query }) => searchProducts(deps, requireTenantId(ctx), query.q, query.limit),
      {
        requireTenant: true,
        requirePermission: 'products.read',
        query: searchQuery,
        detail: { summary: 'Fast POS product search (name, SKU, barcode, aliases)' }
      }
    )
    .get('/:id', async ({ ctx, params }) => getProduct(deps, requireTenantId(ctx), params.id), {
      requireTenant: true,
      requirePermission: 'products.read',
      response: { 200: productSchema },
      detail: { summary: 'Get a product by id' }
    })
    .patch(
      '/:id',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const product = await updateProduct(deps, tenantId, params.id, body);
        await recordAudit(deps.db, ctx, {
          action: 'product.updated',
          entity: 'product',
          entityId: product.id,
          newValues: { name: product.name, price: product.price, status: product.status }
        });
        return product;
      },
      {
        requireTenant: true,
        requirePermission: 'products.update',
        body: updateProductSchema,
        response: { 200: productSchema },
        detail: { summary: 'Update a product' }
      }
    )
    .delete(
      '/:id',
      async ({ ctx, params }) => {
        const tenantId = requireTenantId(ctx);
        await archiveProduct(deps, tenantId, params.id);
        await recordAudit(deps.db, ctx, {
          action: 'product.archived',
          entity: 'product',
          entityId: params.id
        });
        return { ok: true as const };
      },
      {
        requireTenant: true,
        requirePermission: 'products.delete',
        detail: { summary: 'Archive a product (soft delete)' }
      }
    );
