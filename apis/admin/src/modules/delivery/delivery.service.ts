import { and, asc, count, desc, eq, gte, lte, sql } from '@roms/database';
import { deliveries, deliveryZones, orders, riders, riderSettlements } from '@roms/database';
import { AppError, normalizePagination } from '@roms/utils';
import { add, applyRate, fromUnits, toUnits } from '@roms/utils/money';
import type { AppDeps } from '../../app/deps';
import type { RequestContext } from '../../lib/context';

/** Adapter contract so order logic never depends on a single delivery vendor. */
export type DeliveryProvider = {
  readonly name: string;
  dispatch: (delivery: { id: string; address: string | null }) => Promise<{ reference: string }>;
};

export const internalDeliveryProvider: DeliveryProvider = {
  name: 'internal',
  async dispatch() {
    return { reference: 'internal' };
  }
};

export const createDeliveryProviderRegistry = () => {
  const providers = new Map<string, DeliveryProvider>([['internal', internalDeliveryProvider]]);
  return {
    register: (provider: DeliveryProvider) => providers.set(provider.name, provider),
    get: (name: string): DeliveryProvider => providers.get(name) ?? internalDeliveryProvider
  };
};

export const listZones = async (deps: AppDeps, tenantId: string, branchId?: string) => {
  const clauses = [
    eq(deliveryZones.tenantId, tenantId),
    branchId ? eq(deliveryZones.branchId, branchId) : undefined
  ].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(deliveryZones)
    .where(and(...clauses))
    .orderBy(asc(deliveryZones.name));
};

export const createZone = async (
  deps: AppDeps,
  tenantId: string,
  input: { branchId: string; name: string; fee?: string; minOrder?: string }
) => {
  const inserted = await deps.db
    .insert(deliveryZones)
    .values({
      tenantId,
      branchId: input.branchId,
      name: input.name,
      fee: input.fee ?? '0',
      minOrder: input.minOrder ?? '0'
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create zone');
  return row;
};

export const listRiders = async (deps: AppDeps, tenantId: string) => {
  const clauses = [eq(riders.tenantId, tenantId)].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(riders)
    .where(and(...clauses))
    .orderBy(asc(riders.name));
};

export const createRider = async (
  deps: AppDeps,
  tenantId: string,
  input: { name: string; phone?: string; vehicle?: string; commissionRate?: string }
) => {
  const inserted = await deps.db
    .insert(riders)
    .values({
      tenantId,
      name: input.name,
      phone: input.phone ?? null,
      vehicle: input.vehicle ?? null,
      commissionRate: input.commissionRate ?? '0'
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create rider');
  return row;
};

export const createDelivery = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: { orderId: string; zoneId?: string; address?: string; riderId?: string; provider?: string }
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const orderRows = await deps.db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  const order = orderRows[0];
  if (!order) throw AppError.notFound('Order not found');

  const existing = await deps.db
    .select()
    .from(deliveries)
    .where(eq(deliveries.orderId, input.orderId))
    .limit(1);
  const current = existing[0];
  if (current) {
    // One delivery per order (`deliveries_order_unique`). Posting again is the
    // caller saying "this is what it should say", so the fields they sent are
    // applied rather than dropped — returning the old row unchanged would tell
    // a dispatcher a rider had been assigned when the column was still null.
    const patch: Partial<typeof deliveries.$inferInsert> = { updatedAt: new Date() };
    if (input.zoneId !== undefined && input.zoneId !== current.zoneId) {
      const zoneRows = await deps.db
        .select()
        .from(deliveryZones)
        .where(and(eq(deliveryZones.id, input.zoneId), eq(deliveryZones.tenantId, tenantId)))
        .limit(1);
      const zone = zoneRows[0];
      if (!zone) throw AppError.validation('Delivery zone not found');
      patch.zoneId = zone.id;
      patch.fee = zone.fee;
    }
    if (input.address !== undefined) patch.address = input.address;
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.riderId !== undefined && input.riderId !== current.riderId) {
      patch.riderId = input.riderId;
      patch.assignedAt = new Date();
      // Only advance a run that has not already landed; re-posting against a
      // delivered or cancelled row must not drag it back onto the board.
      if (current.status === 'PENDING' || current.status === 'ASSIGNED') patch.status = 'ASSIGNED';
    }

    const updated = await deps.db
      .update(deliveries)
      .set(patch)
      .where(eq(deliveries.id, current.id))
      .returning();
    const row = updated[0];
    if (!row) throw new Error('Failed to update delivery');
    return row;
  }

  let fee = '0';
  if (input.zoneId) {
    const zoneRows = await deps.db
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.id, input.zoneId), eq(deliveryZones.tenantId, tenantId)))
      .limit(1);
    const zone = zoneRows[0];
    if (!zone) throw AppError.validation('Delivery zone not found');
    fee = zone.fee;
  }

  const inserted = await deps.db
    .insert(deliveries)
    .values({
      tenantId,
      branchId: order.branchId,
      orderId: order.id,
      zoneId: input.zoneId ?? null,
      riderId: input.riderId ?? null,
      status: input.riderId ? 'ASSIGNED' : 'PENDING',
      address: input.address ?? null,
      fee,
      provider: input.provider ?? 'internal',
      assignedAt: input.riderId ? new Date() : null
    })
    .returning();
  const delivery = inserted[0];
  if (!delivery) throw new Error('Failed to create delivery');
  return delivery;
};

export const assignRider = async (
  deps: AppDeps,
  tenantId: string,
  deliveryId: string,
  riderId: string
) => {
  const updated = await deps.db
    .update(deliveries)
    .set({ riderId, status: 'ASSIGNED', assignedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(deliveries.id, deliveryId), eq(deliveries.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Delivery not found');
  return row;
};

export const setDeliveryStatus = async (
  deps: AppDeps,
  tenantId: string,
  deliveryId: string,
  status: 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | 'CANCELLED'
) => {
  const updated = await deps.db
    .update(deliveries)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {})
    })
    .where(and(eq(deliveries.id, deliveryId), eq(deliveries.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Delivery not found');
  return row;
};

export const listDeliveries = async (
  deps: AppDeps,
  tenantId: string,
  query: { page?: number; pageSize?: number; status?: string; riderId?: string; branchId?: string }
) => {
  const pagination = normalizePagination(query);
  const clauses = [
    eq(deliveries.tenantId, tenantId),
    query.status ? sql`${deliveries.status}::text = ${query.status}` : undefined,
    query.riderId ? eq(deliveries.riderId, query.riderId) : undefined,
    query.branchId ? eq(deliveries.branchId, query.branchId) : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);
  const [items, totals] = await Promise.all([
    deps.db
      .select()
      .from(deliveries)
      .where(where)
      .orderBy(desc(deliveries.createdAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(deliveries).where(where)
  ]);
  const total = totals[0]?.value ?? 0;
  const totalPages = Math.ceil(total / pagination.pageSize);
  return {
    items,
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

/** Compute a rider's deliveries + commission for a period and record a settlement. */
export const settleRider = async (
  deps: AppDeps,
  tenantId: string,
  input: { riderId: string; periodStart: string; periodEnd: string }
) => {
  const riderRows = await deps.db
    .select()
    .from(riders)
    .where(and(eq(riders.id, input.riderId), eq(riders.tenantId, tenantId)))
    .limit(1);
  const rider = riderRows[0];
  if (!rider) throw AppError.notFound('Rider not found');

  const delivered = await deps.db
    .select({ fee: deliveries.fee })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.tenantId, tenantId),
        eq(deliveries.riderId, input.riderId),
        eq(deliveries.status, 'DELIVERED'),
        gte(deliveries.deliveredAt, new Date(input.periodStart)),
        lte(deliveries.deliveredAt, new Date(input.periodEnd))
      )
    );

  const feeTotal = delivered.reduce((sum, row) => add(sum, toUnits(row.fee)), 0n);
  const commission = applyRate(feeTotal, rider.commissionRate);

  const inserted = await deps.db
    .insert(riderSettlements)
    .values({
      tenantId,
      riderId: input.riderId,
      orderCount: delivered.length,
      amount: fromUnits(commission),
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd)
    })
    .returning();
  const settlement = inserted[0];
  if (!settlement) throw new Error('Failed to read back the settlement');
  return settlement;
};
