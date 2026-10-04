import { Elysia } from 'elysia';
import { z } from 'zod';
import { moneySchema, rateSchema, uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import {
  createRecipe,
  getRecipe,
  listProductionRuns,
  listRecipes,
  produceRecipe,
  setRecipeStatus
} from './recipes.service';

const recipeBody = z.object({
  productId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  yieldQuantity: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default('1'),
  yieldUnit: z.string().trim().max(20).default('unit'),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        componentProductId: uuidSchema,
        quantity: z.string().regex(/^\d+(\.\d{1,4})?$/),
        unit: z.string().trim().max(20).default('unit'),
        wastageRate: rateSchema.default('0'),
        unitCost: moneySchema.default('0')
      })
    )
    .min(1)
});

export const recipesModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/recipes', tags: ['recipes'] })
    .use(authPlugin(deps))
    .get('/', async ({ ctx, query }) => listRecipes(deps, requireTenantId(ctx), query.productId), {
      requireTenant: true,
      requirePermission: 'products.read',
      query: z.object({ productId: uuidSchema.optional() })
    })
    .post(
      '/',
      async ({ ctx, body }) => {
        const recipe = await createRecipe(deps, requireTenantId(ctx), body);
        await recordAudit(deps.db, ctx, {
          action: 'recipe.created',
          entity: 'recipe',
          entityId: recipe.id,
          newValues: { version: recipe.version }
        });
        return recipe;
      },
      { requireTenant: true, requirePermission: 'products.create', body: recipeBody }
    )
    .get('/:id', async ({ ctx, params }) => getRecipe(deps, requireTenantId(ctx), params.id), {
      requireTenant: true,
      requirePermission: 'products.read'
    })
    .post(
      '/:id/status',
      async ({ ctx, params, body }) =>
        setRecipeStatus(deps, requireTenantId(ctx), params.id, body.status),
      {
        requireTenant: true,
        requirePermission: 'products.update',
        body: z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) })
      }
    )
    .post(
      '/:id/produce',
      async ({ ctx, params, body }) =>
        produceRecipe(deps, ctx, {
          recipeId: params.id,
          quantity: body.quantity,
          branchId: body.branchId
        }),
      {
        requireTenant: true,
        requirePermission: 'inventory.adjust',
        body: z.object({ quantity: z.number().int().min(1), branchId: uuidSchema.optional() })
      }
    )
    .get('/production/runs', async ({ ctx }) => listProductionRuns(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'inventory.read'
    });
