import { Elysia } from 'elysia';
import {
  cashMovementSchema,
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentDtoSchema,
  refundPaymentSchema
} from '@roms/contracts/payments';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import { createPayment, listPayments, recordCashMovement, refundPayment } from './payments.service';
import { resolveBranch } from '../orders/orders.service';

export const paymentsModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/payments', tags: ['payments'] })
    .use(authPlugin(deps))
    .get('/', async ({ ctx, query }) => listPayments(deps, requireTenantId(ctx), query), {
      requireTenant: true,
      requirePermission: 'payments.read',
      query: listPaymentsQuerySchema,
      detail: { summary: 'List payments' }
    })
    .post(
      '/',
      async ({ ctx, body }) => {
        const payment = await createPayment(deps, ctx, body);
        await recordAudit(deps.db, ctx, {
          action: 'payment.captured',
          entity: 'payment',
          entityId: payment.id,
          newValues: { orderId: payment.orderId, amount: payment.amount, method: payment.method }
        });
        return payment;
      },
      {
        requireTenant: true,
        requirePermission: 'payments.manage',
        body: createPaymentSchema,
        response: { 200: paymentDtoSchema },
        detail: { summary: 'Capture a payment (idempotent via idempotencyKey)' }
      }
    )
    .post(
      '/:id/refund',
      async ({ ctx, params, body }) => {
        const payment = await refundPayment(deps, ctx, params.id, body);
        await recordAudit(deps.db, ctx, {
          action: 'payment.refunded',
          entity: 'payment',
          entityId: payment.id,
          newValues: { refundedAmount: payment.refundedAmount, status: payment.status }
        });
        return payment;
      },
      {
        requireTenant: true,
        requirePermission: 'payments.refund',
        body: refundPaymentSchema,
        response: { 200: paymentDtoSchema },
        detail: { summary: 'Refund a payment (idempotent)' }
      }
    )
    .post(
      '/cash-movements',
      async ({ ctx, body }) => {
        const branchId = await resolveBranch(deps, ctx, body.branchId);
        return recordCashMovement(deps, ctx, branchId, body.direction, body.amount, body.reason);
      },
      {
        requireTenant: true,
        requirePermission: 'payments.manage',
        body: cashMovementSchema,
        detail: { summary: 'Record a cash-drawer movement' }
      }
    );
