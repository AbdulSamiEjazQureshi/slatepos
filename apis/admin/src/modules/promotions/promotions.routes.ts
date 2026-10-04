import { Elysia } from 'elysia';
import { z } from 'zod';
import { moneySchema, rateSchema, uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import {
  createPromotion,
  evaluatePromotion,
  listPromotions,
  updatePromotion
} from './promotions.service';

const promotionBody = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(['PERCENT', 'FIXED', 'BOGO']).default('PERCENT'),
  value: rateSchema,
  code: z.string().trim().max(40).nullable().optional(),
  minOrder: moneySchema.default('0'),
  maxDiscount: moneySchema.nullable().optional(),
  branchIds: z.array(uuidSchema).default([]),
  productIds: z.array(uuidSchema).default([]),
  categoryIds: z.array(uuidSchema).default([]),
  customerGroup: z.string().trim().max(60).nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  isActive: z.boolean().default(true)
});

export const promotionsModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/promotions', tags: ['catalog'] })
    .use(authPlugin(deps))
    .get('/', async ({ ctx }) => listPromotions(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'categories.read'
    })
    .post('/', async ({ ctx, body }) => createPromotion(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'categories.manage',
      body: promotionBody
    })
    .patch(
      '/:id',
      async ({ ctx, params, body }) => updatePromotion(deps, requireTenantId(ctx), params.id, body),
      { requireTenant: true, requirePermission: 'categories.manage', body: promotionBody.partial() }
    )
    .post(
      '/evaluate',
      async ({ ctx, body }) => evaluatePromotion(deps, requireTenantId(ctx), body),
      {
        requireTenant: true,
        requirePermission: 'orders.create',
        body: z.object({
          subtotal: moneySchema,
          code: z.string().trim().max(40).optional(),
          branchId: uuidSchema.optional(),
          productIds: z.array(uuidSchema).optional(),
          categoryIds: z.array(uuidSchema).optional(),
          customerGroup: z.string().max(60).optional()
        }),
        detail: { summary: 'Evaluate the best applicable promotion (server-side)' }
      }
    );
