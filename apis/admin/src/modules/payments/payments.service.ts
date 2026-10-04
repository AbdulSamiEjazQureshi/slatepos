import { and, count, desc, eq, inArray } from '@roms/database';
import {
  cashMovements,
  orders,
  payments,
  refunds,
  tenants,
  type Db,
  type PaymentRow
} from '@roms/database';
import type { CreatePaymentInput, PaymentDto, RefundPaymentInput } from '@roms/contracts/payments';
import { DEFAULT_TENANT_SETTINGS } from '@roms/contracts/settings';
import { RealtimeTopic } from '@roms/contracts/events';
import { AppError, normalizePagination, type PaginationMeta } from '@roms/utils';
import { compare, fromUnits, subtract, toUnits } from '@roms/utils/money';
import type { AppDeps } from '../../app/deps';
import type { RequestContext } from '../../lib/context';

const toPaymentDto = (row: PaymentRow): PaymentDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  orderId: row.orderId,
  method: row.method,
  status: row.status,
  amount: row.amount,
  refundedAmount: row.refundedAmount,
  currency: row.currency,
  provider: row.provider,
  providerReference: row.providerReference,
  idempotencyKey: row.idempotencyKey,
  capturedAt: row.capturedAt?.toISOString() ?? null,
  failedAt: row.failedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const currencyFor = async (db: Db, tenantId: string): Promise<string> => {
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0]?.settings?.currency ?? DEFAULT_TENANT_SETTINGS.currency;
};

const capturedTotal = async (tx: Db, orderId: string): Promise<bigint> => {
  const rows = await tx
    .select({ amount: payments.amount })
    .from(payments)
    .where(
      and(
        eq(payments.orderId, orderId),
        inArray(payments.status, ['CAPTURED', 'AUTHORIZED', 'PARTIALLY_REFUNDED'])
      )
    );
  return rows.reduce((total, row) => total + toUnits(row.amount), 0n);
};

export const createPayment = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: CreatePaymentInput
): Promise<PaymentDto> => {
  if (toUnits(input.amount) <= 0n)
    throw AppError.unprocessable('payment_failed', 'Payment amount must be greater than zero');
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  // Idempotent: a repeated key returns the original payment.
  const existing = await deps.db
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  const prior = existing[0];
  if (prior) return toPaymentDto(prior);

  const paymentId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const orderRows = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.tenantId, tenantId)))
      .for('update')
      .limit(1);
    const order = orderRows[0];
    if (!order) throw AppError.notFound('Order not found');
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      throw AppError.unprocessable(
        'invalid_state_transition',
        `Cannot pay a ${order.status} order`
      );
    }

    // Another request with this key may have committed while we waited for the order lock.
    const repeated = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.tenantId, tenantId), eq(payments.idempotencyKey, input.idempotencyKey))
      )
      .limit(1);
    if (repeated[0]) return repeated[0].id;

    const alreadyCaptured = await capturedTotal(tx, order.id);
    const newTotal = alreadyCaptured + toUnits(input.amount);
    if (compare(newTotal, toUnits(order.grandTotal)) > 0) {
      throw AppError.unprocessable('payment_failed', 'Payment exceeds the outstanding order total');
    }

    const currency = await currencyFor(tx, tenantId);
    const now = new Date();
    const inserted = await tx
      .insert(payments)
      .values({
        tenantId,
        branchId: order.branchId,
        orderId: order.id,
        method: input.method,
        status: 'CAPTURED',
        amount: input.amount,
        currency,
        provider: input.method === 'CASH' ? 'cash' : 'internal',
        providerReference: input.providerReference ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? null,
        capturedAt: now,
        createdBy: ctx.userId
      })
      .returning({ id: payments.id });
    const payment = inserted[0];
    if (!payment) throw new Error('Failed to create payment');

    if (input.method === 'CASH') {
      await tx.insert(cashMovements).values({
        tenantId,
        branchId: order.branchId,
        direction: 'IN',
        amount: input.amount,
        reason: `Payment for order ${order.number}`,
        createdBy: ctx.userId
      });
    }
    return payment.id;
  });

  const created = await deps.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  const dto = toPaymentDto(created[0] as PaymentRow);
  deps.realtime.publish(RealtimeTopic.branchPayments(dto.branchId), {
    type: 'payment.status_changed',
    paymentId: dto.id,
    orderId: dto.orderId,
    status: dto.status
  });
  return dto;
};

export const refundPayment = async (
  deps: AppDeps,
  ctx: RequestContext,
  paymentId: string,
  input: RefundPaymentInput
): Promise<PaymentDto> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const duplicate = await deps.db
    .select({ id: refunds.id })
    .from(refunds)
    .where(and(eq(refunds.tenantId, tenantId), eq(refunds.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (duplicate.length > 0) {
    const current = await deps.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!current[0]) throw AppError.notFound('Payment not found');
    return toPaymentDto(current[0]);
  }

  await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const rows = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
      .for('update')
      .limit(1);
    const payment = rows[0];
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw AppError.unprocessable(
        'invalid_state_transition',
        `Cannot refund a ${payment.status} payment`
      );
    }

    const remaining = subtract(toUnits(payment.amount), toUnits(payment.refundedAmount));
    const requested = input.amount ? toUnits(input.amount) : remaining;
    if (requested <= 0n || compare(requested, remaining) > 0) {
      throw AppError.unprocessable(
        'payment_failed',
        'Refund amount exceeds the refundable balance'
      );
    }

    await tx.insert(refunds).values({
      tenantId,
      paymentId: payment.id,
      amount: fromUnits(requested),
      reason: input.reason ?? null,
      idempotencyKey: input.idempotencyKey,
      createdBy: ctx.userId
    });

    const refundedTotal = toUnits(payment.refundedAmount) + requested;
    const fullyRefunded = refundedTotal >= toUnits(payment.amount);
    await tx
      .update(payments)
      .set({
        refundedAmount: fromUnits(refundedTotal),
        status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        updatedAt: new Date()
      })
      .where(eq(payments.id, payment.id));

    if (payment.method === 'CASH') {
      await tx.insert(cashMovements).values({
        tenantId,
        branchId: payment.branchId,
        direction: 'OUT',
        amount: fromUnits(requested),
        reason: `Refund for payment ${payment.id}`,
        createdBy: ctx.userId
      });
    }

    if (fullyRefunded) {
      await tx
        .update(orders)
        .set({ status: 'REFUNDED', updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));
    }
  });

  const updated = await deps.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  const dto = toPaymentDto(updated[0] as PaymentRow);
  deps.realtime.publish(RealtimeTopic.branchPayments(dto.branchId), {
    type: 'payment.status_changed',
    paymentId: dto.id,
    orderId: dto.orderId,
    status: dto.status
  });
  return dto;
};

export type PaymentListFilters = {
  page?: number;
  pageSize?: number;
  orderId?: string;
  status?: PaymentDto['status'];
  method?: PaymentDto['method'];
};

export const listPayments = async (
  deps: AppDeps,
  tenantId: string,
  filters: PaymentListFilters
): Promise<{ items: PaymentDto[]; meta: PaginationMeta }> => {
  const pagination = normalizePagination(filters);
  const clauses = [
    eq(payments.tenantId, tenantId),
    filters.orderId ? eq(payments.orderId, filters.orderId) : undefined,
    filters.status ? eq(payments.status, filters.status) : undefined,
    filters.method ? eq(payments.method, filters.method) : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);

  const [rows, totals] = await Promise.all([
    deps.db
      .select()
      .from(payments)
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(payments).where(where)
  ]);

  const total = totals[0]?.value ?? 0;
  const totalPages = Math.ceil(total / pagination.pageSize);
  return {
    items: rows.map(toPaymentDto),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrevious: pagination.page > 1
    }
  };
};

/** Record a manual cash-drawer movement (float, drop, payout). */
export const recordCashMovement = async (
  deps: AppDeps,
  ctx: RequestContext,
  branchId: string,
  direction: 'IN' | 'OUT',
  amount: string,
  reason: string
): Promise<{ id: string }> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  if (toUnits(amount) <= 0n) throw AppError.validation('Amount must be positive');
  const inserted = await deps.db
    .insert(cashMovements)
    .values({ tenantId, branchId, direction, amount, reason, createdBy: ctx.userId })
    .returning({ id: cashMovements.id });
  const row = inserted[0];
  if (!row) throw new Error('Failed to record cash movement');
  return row;
};
