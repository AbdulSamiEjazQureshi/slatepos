import { Elysia } from 'elysia';
import { z } from 'zod';
import { listQuerySchema, moneySchema, rateSchema, uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import {
  createPurchaseOrder,
  createPurchaseReturn,
  createSupplier,
  getPurchaseOrder,
  listPurchaseOrders,
  listSupplierLedger,
  listSuppliers,
  paySupplier,
  receivePurchaseOrder,
  setPurchaseOrderStatus,
  updateSupplier
} from './purchasing.service';

const supplierBody = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().max(400).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(0)
});

const purchaseOrderBody = z.object({
  supplierId: uuidSchema,
  branchId: uuidSchema.optional(),
  expectedDate: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        variantId: uuidSchema.nullable().optional(),
        quantity: z.number().int().min(1),
        unitCost: moneySchema,
        taxRate: rateSchema.default('0')
      })
    )
    .min(1)
});

const receiveBody = z.object({
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(z.object({ purchaseOrderItemId: uuidSchema, quantity: z.number().int().min(1) }))
    .min(1)
});

const supplierPaymentBody = z.object({
  supplierId: uuidSchema,
  amount: moneySchema,
  method: z.string().trim().max(30).default('CASH'),
  reference: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().min(8).max(120)
});

const purchaseReturnBody = z.object({
  supplierId: uuidSchema,
  branchId: uuidSchema.optional(),
  reason: z.string().trim().max(300).optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        variantId: uuidSchema.nullable().optional(),
        quantity: z.number().int().min(1),
        unitCost: moneySchema
      })
    )
    .min(1)
});

export const purchasingModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/purchasing', tags: ['purchasing'] })
    .use(authPlugin(deps))
    .get('/suppliers', async ({ ctx, query }) => listSuppliers(deps, requireTenantId(ctx), query), {
      requireTenant: true,
      requirePermission: 'purchases.read',
      query: listQuerySchema.extend({ isActive: z.coerce.boolean().optional() })
    })
    .post('/suppliers', async ({ ctx, body }) => createSupplier(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'purchases.manage',
      body: supplierBody
    })
    .patch(
      '/suppliers/:id',
      async ({ ctx, params, body }) => updateSupplier(deps, requireTenantId(ctx), params.id, body),
      {
        requireTenant: true,
        requirePermission: 'purchases.manage',
        body: supplierBody.partial().extend({ isActive: z.boolean().optional() })
      }
    )
    .get(
      '/suppliers/:id/ledger',
      async ({ ctx, params }) => listSupplierLedger(deps, requireTenantId(ctx), params.id),
      {
        requireTenant: true,
        requirePermission: 'purchases.read'
      }
    )
    .post(
      '/suppliers/payments',
      async ({ ctx, body }) => {
        const payment = await paySupplier(deps, ctx, body);
        await recordAudit(deps.db, ctx, {
          action: 'supplier.paid',
          entity: 'supplier',
          entityId: body.supplierId,
          newValues: { amount: body.amount }
        });
        return payment;
      },
      { requireTenant: true, requirePermission: 'purchases.manage', body: supplierPaymentBody }
    )
    .get(
      '/purchase-orders',
      async ({ ctx, query }) =>
        listPurchaseOrders(deps, requireTenantId(ctx), {
          page: query.page,
          pageSize: query.pageSize,
          status: query.status,
          supplierId: query.supplierId,
          branchId: query.branchId
        }),
      {
        requireTenant: true,
        requirePermission: 'purchases.read',
        query: listQuerySchema.extend({
          status: z.string().max(30).optional(),
          supplierId: uuidSchema.optional(),
          branchId: uuidSchema.optional()
        })
      }
    )
    .post(
      '/purchase-orders',
      async ({ ctx, body }) => {
        const order = await createPurchaseOrder(deps, ctx, body);
        await recordAudit(deps.db, ctx, {
          action: 'purchase_order.created',
          entity: 'purchase_order',
          entityId: order.id,
          newValues: { number: order.number, total: order.total }
        });
        return order;
      },
      { requireTenant: true, requirePermission: 'purchases.manage', body: purchaseOrderBody }
    )
    .get(
      '/purchase-orders/:id',
      async ({ ctx, params }) => getPurchaseOrder(deps, requireTenantId(ctx), params.id),
      {
        requireTenant: true,
        requirePermission: 'purchases.read'
      }
    )
    .post(
      '/purchase-orders/:id/status',
      async ({ ctx, params, body }) =>
        setPurchaseOrderStatus(deps, requireTenantId(ctx), params.id, body.status),
      {
        requireTenant: true,
        requirePermission: 'purchases.manage',
        body: z.object({ status: z.enum(['ORDERED', 'CANCELLED']) })
      }
    )
    .post(
      '/purchase-orders/:id/receive',
      async ({ ctx, params, body }) => {
        const receipt = await receivePurchaseOrder(deps, ctx, params.id, body);
        await recordAudit(deps.db, ctx, {
          action: 'purchase_order.received',
          entity: 'purchase_order',
          entityId: params.id,
          newValues: { receipt: receipt.number }
        });
        return receipt;
      },
      { requireTenant: true, requirePermission: 'purchases.manage', body: receiveBody }
    )
    .post('/purchase-returns', async ({ ctx, body }) => createPurchaseReturn(deps, ctx, body), {
      requireTenant: true,
      requirePermission: 'purchases.manage',
      body: purchaseReturnBody
    });
