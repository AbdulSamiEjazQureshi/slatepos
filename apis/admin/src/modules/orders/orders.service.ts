import { and, count, desc, eq, inArray, sql } from '@roms/database';
import {
  branches,
  modifierOptions,
  orderCounters,
  orderItemModifiers,
  orderItems,
  orders,
  products,
  type Db,
  type OrderItemModifierRow,
  type OrderItemRow,
  type OrderRow
} from '@roms/database';
import type { CreateOrderInput, OrderDto, UpdateOrderInput } from '@roms/contracts/orders';
import type { OrderStatus } from '@roms/contracts/enums';
import { RealtimeTopic, type OrderEvent } from '@roms/contracts/events';
import { AppError, normalizePagination, type PaginationMeta } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { calculateOrderTotals, formatPricing, type PricingLineInput } from '../../domain/pricing';
import { transitionOrderStatus } from '../../domain/order-state';
import { hasGlobalBranchAccess, loadPrincipal } from '../../infrastructure/principal';
import { applyStockMovement } from '../inventory/stock';
import { ensureKitchenTicket, voidKitchenTicket } from '../kitchen/kitchen.service';
import { createTaxInvoice } from '../integrations/integrations.service';
import type { RequestContext } from '../../lib/context';

type Tx = Db;

const toOrderItemDto = (
  item: OrderItemRow,
  modifiers: OrderItemModifierRow[]
): OrderDto['items'][number] => ({
  id: item.id,
  productId: item.productId,
  variantId: item.variantId,
  name: item.name,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  lineTotal: item.lineTotal,
  taxAmount: item.taxAmount,
  discountAmount: item.discountAmount,
  status: item.status,
  notes: item.notes,
  modifiers: modifiers.map((modifier) => ({
    id: modifier.id,
    name: modifier.name,
    priceDelta: modifier.priceDelta
  }))
});

const toOrderDto = (
  order: OrderRow,
  items: OrderItemRow[],
  modifiers: OrderItemModifierRow[]
): OrderDto => ({
  id: order.id,
  tenantId: order.tenantId,
  branchId: order.branchId,
  number: order.number,
  type: order.type,
  status: order.status,
  tableId: order.tableId,
  customerId: order.customerId,
  cashierId: order.cashierId,
  totals: {
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    taxTotal: order.taxTotal,
    serviceCharge: order.serviceCharge,
    tip: order.tip,
    deliveryFee: order.deliveryFee,
    grandTotal: order.grandTotal
  },
  notes: order.notes,
  items: items.map((item) =>
    toOrderItemDto(
      item,
      modifiers.filter((modifier) => modifier.orderItemId === item.id)
    )
  ),
  version: order.version,
  scheduledFor: order.scheduledFor?.toISOString() ?? null,
  confirmedAt: order.confirmedAt?.toISOString() ?? null,
  completedAt: order.completedAt?.toISOString() ?? null,
  cancelledAt: order.cancelledAt?.toISOString() ?? null,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString()
});

/** Resolve and authorise the branch for an order operation. */
export const resolveBranch = async (
  deps: AppDeps,
  ctx: RequestContext,
  requested?: string
): Promise<string> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  const branchId = requested ?? ctx.branchId;
  if (!branchId) {
    throw AppError.unprocessable(
      'branch_required',
      'A branch is required (pass branchId or x-branch-id)'
    );
  }

  const rows = await deps.db
    .select({ id: branches.id, isActive: branches.isActive })
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)))
    .limit(1);
  const branch = rows[0];
  if (!branch || !branch.isActive) throw AppError.notFound('Branch not found');

  if (!ctx.isPlatformAdmin && ctx.userId) {
    const principal = await loadPrincipal(deps.db, deps.cache, ctx.userId);
    if (principal && !hasGlobalBranchAccess(principal) && !principal.branchIds.includes(branchId)) {
      throw AppError.forbidden('You do not have access to this branch');
    }
  }
  return branchId;
};

const nextOrderNumber = async (
  tx: Tx,
  tenantId: string,
  branchId: string,
  prefix: string
): Promise<string> => {
  const rows = await tx
    .insert(orderCounters)
    .values({ tenantId, branchId, nextValue: 1 })
    .onConflictDoUpdate({
      target: [orderCounters.tenantId, orderCounters.branchId],
      set: { nextValue: sql`${orderCounters.nextValue} + 1` }
    })
    .returning({ nextValue: orderCounters.nextValue });
  const value = rows[0]?.nextValue ?? 1;
  return `${prefix}-${String(value).padStart(5, '0')}`;
};

const buildPricingLines = async (
  tx: Tx,
  tenantId: string,
  input: CreateOrderInput
): Promise<{
  lines: PricingLineInput[];
  resolved: {
    productId: string;
    variantId: string | null;
    name: string;
    unitPrice: string;
    taxRate: string;
    trackInventory: boolean;
    notes?: string;
    modifiers: { optionId: string; name: string; priceDelta: string }[];
    quantity: number;
  }[];
}> => {
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const productRows = await tx
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));
  const productById = new Map(productRows.map((row) => [row.id, row]));

  const optionIds = [
    ...new Set(input.items.flatMap((item) => item.modifiers.map((m) => m.modifierOptionId)))
  ];
  const optionRows =
    optionIds.length > 0
      ? await tx.select().from(modifierOptions).where(inArray(modifierOptions.id, optionIds))
      : [];
  const optionById = new Map(optionRows.map((row) => [row.id, row]));

  const resolved = input.items.map((item) => {
    const product = productById.get(item.productId);
    if (!product)
      throw AppError.validation('Unknown product', {
        items: [`Product ${item.productId} not found`]
      });
    if (!product.isAvailable || product.status !== 'ACTIVE') {
      throw AppError.unprocessable('unprocessable', 'Product is unavailable', {
        items: [`${product.name} is unavailable`]
      });
    }

    const selectedModifiers = item.modifiers.map((selection) => {
      const option = optionById.get(selection.modifierOptionId);
      if (!option) {
        throw AppError.validation('Unknown modifier', {
          items: [`Modifier ${selection.modifierOptionId} not found`]
        });
      }
      return { optionId: option.id, name: option.name, priceDelta: option.priceDelta };
    });

    // Server-authoritative price: client-sent prices are ignored unless an
    // authorized override is explicitly provided.
    const unitPrice = item.priceOverride ?? product.price;

    return {
      productId: product.id,
      variantId: item.variantId ?? null,
      name: product.name,
      unitPrice,
      taxRate: product.taxRate,
      trackInventory: product.trackInventory,
      quantity: item.quantity,
      ...(item.notes ? { notes: item.notes } : {}),
      modifiers: selectedModifiers
    };
  });

  const lines: PricingLineInput[] = resolved.map((line) => ({
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    taxRate: line.taxRate,
    modifiers: line.modifiers.map((modifier) => ({ priceDelta: modifier.priceDelta }))
  }));

  return { lines, resolved };
};

const insertOrderItems = async (
  tx: Tx,
  orderId: string,
  tenantId: string,
  branchId: string,
  resolved: Awaited<ReturnType<typeof buildPricingLines>>['resolved'],
  priced: ReturnType<typeof formatPricing>
): Promise<void> => {
  for (const [index, line] of resolved.entries()) {
    const amounts = priced.lines[index];
    if (!amounts) continue;
    const inserted = await tx
      .insert(orderItems)
      .values({
        orderId,
        tenantId,
        branchId,
        productId: line.productId,
        variantId: line.variantId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        lineSubtotal: amounts.lineSubtotal,
        discountAmount: amounts.discountAmount,
        taxAmount: amounts.taxAmount,
        lineTotal: amounts.lineTotal,
        notes: line.notes ?? null,
        sortOrder: index
      })
      .returning({ id: orderItems.id });
    const item = inserted[0];
    if (!item) continue;
    if (line.modifiers.length > 0) {
      await tx.insert(orderItemModifiers).values(
        line.modifiers.map((modifier) => ({
          orderItemId: item.id,
          modifierOptionId: modifier.optionId,
          name: modifier.name,
          priceDelta: modifier.priceDelta
        }))
      );
    }
  }
};

export const createOrder = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: CreateOrderInput
): Promise<OrderDto> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const branchId = await resolveBranch(deps, ctx, input.branchId);

  if (input.idempotencyKey) {
    const existing = await deps.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    const found = existing[0];
    if (found) return getOrder(deps, tenantId, found.id);
  }

  const orderId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const { lines, resolved } = await buildPricingLines(tx, tenantId, input);
    const pricing = formatPricing(
      calculateOrderTotals({
        lines,
        discount: input.discount ?? null,
        tip: input.tip,
        deliveryFee: '0'
      })
    );

    const number = await nextOrderNumber(tx, tenantId, branchId, 'ORD');
    const inserted = await tx
      .insert(orders)
      .values({
        tenantId,
        branchId,
        number,
        type: input.type,
        status: 'DRAFT',
        tableId: input.tableId ?? null,
        customerId: input.customerId ?? null,
        cashierId: ctx.userId,
        subtotal: pricing.totals.subtotal,
        discountType: input.discount?.type ?? null,
        discountValue: input.discount?.value ?? null,
        discountTotal: pricing.totals.discountTotal,
        taxTotal: pricing.totals.taxTotal,
        serviceCharge: pricing.totals.serviceCharge,
        tip: pricing.totals.tip,
        deliveryFee: pricing.totals.deliveryFee,
        grandTotal: pricing.totals.grandTotal,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null
      })
      .returning({ id: orders.id });
    const order = inserted[0];
    if (!order) throw new Error('Failed to create order');

    await insertOrderItems(tx, order.id, tenantId, branchId, resolved, pricing);
    return order.id;
  });

  const order = await getOrder(deps, tenantId, orderId);
  publishOrderEvent(deps, branchId, {
    type: 'order.created',
    orderId,
    branchId,
    orderNumber: order.number
  });
  return order;
};

export const getOrder = async (
  deps: AppDeps,
  tenantId: string,
  orderId: string
): Promise<OrderDto> => {
  const rows = await deps.db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  const order = rows[0];
  if (!order) throw AppError.notFound('Order not found');

  const items = await deps.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const modifiers =
    items.length > 0
      ? await deps.db
          .select()
          .from(orderItemModifiers)
          .where(
            inArray(
              orderItemModifiers.orderItemId,
              items.map((item) => item.id)
            )
          )
      : [];

  return toOrderDto(order, items, modifiers);
};

export type OrderListFilters = {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  type?: OrderDto['type'];
  branchId?: string;
  tableId?: string;
  customerId?: string;
  from?: string;
  to?: string;
};

export const listOrders = async (
  deps: AppDeps,
  tenantId: string,
  filters: OrderListFilters
): Promise<{ items: OrderDto[]; meta: PaginationMeta }> => {
  const pagination = normalizePagination(filters);
  const clauses = [
    eq(orders.tenantId, tenantId),
    filters.status ? eq(orders.status, filters.status) : undefined,
    filters.type ? eq(orders.type, filters.type) : undefined,
    filters.branchId ? eq(orders.branchId, filters.branchId) : undefined,
    filters.tableId ? eq(orders.tableId, filters.tableId) : undefined,
    filters.customerId ? eq(orders.customerId, filters.customerId) : undefined,
    filters.from ? sql`${orders.createdAt} >= ${new Date(filters.from)}` : undefined,
    filters.to ? sql`${orders.createdAt} <= ${new Date(filters.to)}` : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);

  const [rows, totals] = await Promise.all([
    deps.db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(orders).where(where)
  ]);

  const itemRows =
    rows.length > 0
      ? await deps.db
          .select()
          .from(orderItems)
          .where(
            inArray(
              orderItems.orderId,
              rows.map((row) => row.id)
            )
          )
      : [];
  const modifierRows =
    itemRows.length > 0
      ? await deps.db
          .select()
          .from(orderItemModifiers)
          .where(
            inArray(
              orderItemModifiers.orderItemId,
              itemRows.map((item) => item.id)
            )
          )
      : [];

  const total = totals[0]?.value ?? 0;
  const totalPages = Math.ceil(total / pagination.pageSize);
  return {
    items: rows.map((order) =>
      toOrderDto(
        order,
        itemRows.filter((item) => item.orderId === order.id),
        modifierRows
      )
    ),
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

export const updateOrder = async (
  deps: AppDeps,
  ctx: RequestContext,
  orderId: string,
  input: UpdateOrderInput
): Promise<OrderDto> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const rows = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .for('update')
      .limit(1);
    const order = rows[0];
    if (!order) throw AppError.notFound('Order not found');
    if (order.status !== 'DRAFT' && order.status !== 'CONFIRMED') {
      throw AppError.unprocessable(
        'invalid_state_transition',
        `Cannot edit an order in ${order.status} state`
      );
    }
    if (input.version !== undefined && input.version !== order.version) {
      throw AppError.unprocessable(
        'concurrency_conflict',
        'This order was modified by someone else'
      );
    }

    let totals = {
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      taxTotal: order.taxTotal,
      serviceCharge: order.serviceCharge,
      tip: order.tip,
      deliveryFee: order.deliveryFee,
      grandTotal: order.grandTotal
    };

    if (input.items) {
      const { lines, resolved } = await buildPricingLines(tx, tenantId, {
        type: order.type,
        items: input.items,
        discount: input.discount ?? null,
        tip: input.tip ?? '0'
      });
      const pricing = formatPricing(
        calculateOrderTotals({
          lines,
          discount: input.discount ?? null,
          tip: input.tip ?? '0'
        })
      );
      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await insertOrderItems(tx, orderId, tenantId, order.branchId, resolved, pricing);
      totals = pricing.totals;
    }

    await tx
      .update(orders)
      .set({
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        serviceCharge: totals.serviceCharge,
        tip: totals.tip,
        grandTotal: totals.grandTotal,
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.tableId !== undefined ? { tableId: input.tableId ?? null } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId ?? null } : {}),
        version: order.version + 1,
        updatedAt: new Date()
      })
      .where(eq(orders.id, orderId));
  });

  return getOrder(deps, tenantId, orderId);
};

const deductInventoryForOrder = async (
  tx: Tx,
  order: OrderRow,
  items: OrderItemRow[],
  userId: string | null
): Promise<void> => {
  const productIds = [
    ...new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))
  ];
  if (productIds.length === 0) return;
  const tracked = await tx
    .select({ id: products.id, trackInventory: products.trackInventory })
    .from(products)
    .where(inArray(products.id, productIds));
  const trackedIds = new Set(tracked.filter((row) => row.trackInventory).map((row) => row.id));

  for (const item of items) {
    if (!item.productId || !trackedIds.has(item.productId)) continue;
    await applyStockMovement(tx, {
      tenantId: order.tenantId,
      branchId: order.branchId,
      productId: item.productId,
      variantId: item.variantId,
      delta: -item.quantity,
      movementType: 'SALE',
      reason: `Order ${order.number}`,
      reference: order.id,
      userId
    });
  }
};

const reverseInventoryForOrder = async (
  tx: Tx,
  order: OrderRow,
  items: OrderItemRow[],
  userId: string | null
): Promise<void> => {
  for (const item of items) {
    if (!item.productId) continue;
    await applyStockMovement(tx, {
      tenantId: order.tenantId,
      branchId: order.branchId,
      productId: item.productId,
      variantId: item.variantId,
      delta: item.quantity,
      movementType: 'REVERSAL',
      reason: `Reversal for order ${order.number}`,
      reference: order.id,
      userId
    });
  }
};

const SELLABLE: readonly OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];

export const updateOrderStatus = async (
  deps: AppDeps,
  ctx: RequestContext,
  orderId: string,
  status: OrderStatus,
  reason?: string
): Promise<OrderDto> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const rows = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .for('update')
      .limit(1);
    const order = rows[0];
    if (!order) throw AppError.notFound('Order not found');

    const transitioned = transitionOrderStatus(order.status, status);
    if (!transitioned.ok) throw transitioned.error;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    // Inventory side effects: deduct when an order first becomes sellable,
    // reverse when a previously sellable order is cancelled.
    const wasSellable = SELLABLE.includes(order.status);
    const willBeSellable = SELLABLE.includes(status);
    if (!wasSellable && willBeSellable) {
      await deductInventoryForOrder(tx, order, items, ctx.userId);
    } else if (wasSellable && status === 'CANCELLED') {
      await reverseInventoryForOrder(tx, order, items, ctx.userId);
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({
        status,
        version: order.version + 1,
        updatedAt: now,
        ...(status === 'CONFIRMED' ? { confirmedAt: now } : {}),
        ...(status === 'READY' ? { readyAt: now } : {}),
        ...(status === 'COMPLETED' ? { completedAt: now } : {}),
        ...(status === 'CANCELLED' ? { cancelledAt: now, cancelReason: reason ?? null } : {})
      })
      .where(eq(orders.id, orderId));

    // Item statuses follow the order through the kitchen flow.
    if (status === 'PREPARING') {
      await tx
        .update(orderItems)
        .set({ status: 'PREPARING' })
        .where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, 'PENDING')));
    } else if (status === 'READY') {
      await tx
        .update(orderItems)
        .set({ status: 'READY' })
        .where(
          and(eq(orderItems.orderId, orderId), inArray(orderItems.status, ['PENDING', 'PREPARING']))
        );
    } else if (status === 'COMPLETED') {
      await tx.update(orderItems).set({ status: 'SERVED' }).where(eq(orderItems.orderId, orderId));
    } else if (status === 'CANCELLED') {
      await tx.update(orderItems).set({ status: 'VOID' }).where(eq(orderItems.orderId, orderId));
    }
  });

  const order = await getOrder(deps, tenantId, orderId);

  // Coordinate other modules: kitchen ticket on confirmation, internal tax
  // invoice, and ticket voiding on cancellation.
  if (status === 'CONFIRMED') {
    await ensureKitchenTicket(deps.db, tenantId, order.branchId, orderId);
    await createTaxInvoice(deps, {
      tenantId,
      branchId: order.branchId,
      orderId,
      invoiceNumber: order.number,
      taxTotal: order.totals.taxTotal,
      payload: { grandTotal: order.totals.grandTotal }
    });
  } else if (status === 'CANCELLED') {
    await voidKitchenTicket(deps.db, orderId);
  }

  publishOrderEvent(deps, order.branchId, {
    type: 'order.status_changed',
    orderId,
    branchId: order.branchId,
    status: order.status
  });
  return order;
};

export const updateOrderItemStatus = async (
  deps: AppDeps,
  ctx: RequestContext,
  orderId: string,
  itemId: string,
  status: OrderItemRow['status']
): Promise<OrderDto> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const orderRows = await deps.db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  if (!orderRows[0]) throw AppError.notFound('Order not found');

  const updated = await deps.db
    .update(orderItems)
    .set({ status })
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
    .returning({ id: orderItems.id });
  if (updated.length === 0) throw AppError.notFound('Order item not found');

  publishOrderEvent(deps, orderRows[0].branchId, {
    type: 'order.item_status_changed',
    orderId,
    orderItemId: itemId,
    status
  });
  return getOrder(deps, tenantId, orderId);
};

const publishOrderEvent = (deps: AppDeps, branchId: string, event: OrderEvent): void => {
  deps.realtime.publish(RealtimeTopic.branchOrders(branchId), event);
  deps.realtime.publish(RealtimeTopic.branchKitchen(branchId), event);
};
