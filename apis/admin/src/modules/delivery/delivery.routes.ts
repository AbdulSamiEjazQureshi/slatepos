import { Elysia } from 'elysia';
import { z } from 'zod';
import { moneySchema, rateSchema, uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import {
  assignRider,
  createDelivery,
  createRider,
  createZone,
  listDeliveries,
  listRiders,
  listZones,
  setDeliveryStatus,
  settleRider
} from './delivery.service';

const deliveryStatusSchema = z.enum([
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'FAILED',
  'CANCELLED'
]);

export const deliveryModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/delivery', tags: ['delivery'] })
    .use(authPlugin(deps))
    .get(
      '/zones',
      async ({ ctx, query }) => listZones(deps, requireTenantId(ctx), query.branchId),
      {
        requireTenant: true,
        requirePermission: 'orders.read',
        query: z.object({ branchId: uuidSchema.optional() })
      }
    )
    .post('/zones', async ({ ctx, body }) => createZone(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'settings.manage',
      body: z.object({
        branchId: uuidSchema,
        name: z.string().trim().min(1).max(120),
        fee: moneySchema.default('0'),
        minOrder: moneySchema.default('0')
      })
    })
    .get('/riders', async ({ ctx }) => listRiders(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'orders.read'
    })
    .post('/riders', async ({ ctx, body }) => createRider(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'settings.manage',
      body: z.object({
        name: z.string().trim().min(2).max(160),
        phone: z.string().trim().max(40).optional(),
        vehicle: z.string().trim().max(40).optional(),
        commissionRate: rateSchema.default('0')
      })
    })
    .get(
      '/deliveries',
      async ({ ctx, query }) =>
        listDeliveries(deps, requireTenantId(ctx), {
          page: query.page,
          pageSize: query.pageSize,
          status: query.status,
          riderId: query.riderId,
          branchId: query.branchId
        }),
      {
        requireTenant: true,
        requirePermission: 'orders.read',
        query: z.object({
          page: z.coerce.number().int().positive().optional(),
          pageSize: z.coerce.number().int().positive().optional(),
          status: z.string().optional(),
          riderId: uuidSchema.optional(),
          branchId: uuidSchema.optional()
        })
      }
    )
    .post('/deliveries', async ({ ctx, body }) => createDelivery(deps, ctx, body), {
      requireTenant: true,
      requirePermission: 'orders.update',
      body: z.object({
        orderId: uuidSchema,
        zoneId: uuidSchema.optional(),
        address: z.string().trim().max(400).optional(),
        riderId: uuidSchema.optional(),
        provider: z.string().max(40).optional()
      })
    })
    .post(
      '/deliveries/:id/rider',
      async ({ ctx, params, body }) =>
        assignRider(deps, requireTenantId(ctx), params.id, body.riderId),
      {
        requireTenant: true,
        requirePermission: 'orders.update',
        body: z.object({ riderId: uuidSchema })
      }
    )
    .post(
      '/deliveries/:id/status',
      async ({ ctx, params, body }) =>
        setDeliveryStatus(deps, requireTenantId(ctx), params.id, body.status),
      {
        requireTenant: true,
        requirePermission: 'orders.update',
        body: z.object({ status: deliveryStatusSchema })
      }
    )
    .post('/settlements', async ({ ctx, body }) => settleRider(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'orders.update',
      body: z.object({
        riderId: uuidSchema,
        periodStart: z.string().datetime({ offset: true }),
        periodEnd: z.string().datetime({ offset: true })
      })
    });
