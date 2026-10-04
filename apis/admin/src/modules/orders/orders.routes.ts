import { Elysia } from 'elysia';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderDtoSchema,
  updateOrderItemStatusSchema,
  updateOrderSchema,
  updateOrderStatusSchema
} from '@roms/contracts/orders';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import {
  createOrder,
  getOrder,
  listOrders,
  updateOrder,
  updateOrderItemStatus,
  updateOrderStatus
} from './orders.service';

export const ordersModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/orders', tags: ['orders'] })
    .use(authPlugin(deps))
    .get('/', async ({ ctx, query }) => listOrders(deps, requireTenantId(ctx), query), {
      requireTenant: true,
      requirePermission: 'orders.read',
      query: listOrdersQuerySchema,
      detail: { summary: 'List orders (paginated, filterable)' }
    })
    .post(
      '/',
      async ({ ctx, body }) => {
        const order = await createOrder(deps, ctx, body);
        await recordAudit(deps.db, ctx, {
          action: 'order.created',
          entity: 'order',
          entityId: order.id,
          newValues: { number: order.number, total: order.totals.grandTotal }
        });
        return order;
      },
      {
        requireTenant: true,
        requirePermission: 'orders.create',
        body: createOrderSchema,
        response: { 200: orderDtoSchema },
        detail: { summary: 'Create an order (server-authoritative pricing)' }
      }
    )
    .get('/:id', async ({ ctx, params }) => getOrder(deps, requireTenantId(ctx), params.id), {
      requireTenant: true,
      requirePermission: 'orders.read',
      response: { 200: orderDtoSchema },
      detail: { summary: 'Get an order by id' }
    })
    .patch('/:id', async ({ ctx, params, body }) => updateOrder(deps, ctx, params.id, body), {
      requireTenant: true,
      requirePermission: 'orders.update',
      body: updateOrderSchema,
      response: { 200: orderDtoSchema },
      detail: { summary: 'Update a draft/confirmed order (optimistic concurrency via version)' }
    })
    .post(
      '/:id/status',
      async ({ ctx, params, body }) => {
        const order = await updateOrderStatus(deps, ctx, params.id, body.status, body.reason);
        await recordAudit(deps.db, ctx, {
          action: `order.${body.status.toLowerCase()}`,
          entity: 'order',
          entityId: order.id,
          newValues: { status: order.status }
        });
        return order;
      },
      {
        requireTenant: true,
        requirePermission: 'orders.update',
        body: updateOrderStatusSchema,
        response: { 200: orderDtoSchema },
        detail: { summary: 'Transition order status through the state machine' }
      }
    )
    .post(
      '/:id/items/:itemId/status',
      async ({ ctx, params, body }) =>
        updateOrderItemStatus(deps, ctx, params.id, params.itemId, body.status),
      {
        requireTenant: true,
        requirePermission: 'orders.update',
        body: updateOrderItemStatusSchema,
        response: { 200: orderDtoSchema },
        detail: { summary: 'Update a single order item status (kitchen flow)' }
      }
    );
