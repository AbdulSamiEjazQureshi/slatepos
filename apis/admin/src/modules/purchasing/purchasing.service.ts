import { and, asc, count, desc, eq, inArray, sql } from '@roms/database';
import {
  goodsReceiptItems,
  goodsReceipts,
  products,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReturnItems,
  purchaseReturns,
  supplierLedgerEntries,
  supplierPayments,
  suppliers,
  type Db
} from '@roms/database';
import { AppError, normalizePagination, type PaginationMeta } from '@roms/utils';
import { add, fromUnits, subtract, toUnits } from '@roms/utils/money';
import type { AppDeps } from '../../app/deps';
import type { RequestContext } from '../../lib/context';
import { nextDocumentNumber } from '../../lib/documents';
import { applyStockMovement } from '../inventory/stock';
import { resolveBranch } from '../orders/orders.service';

export type SupplierInput = {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTermsDays?: number;
};

export const listSuppliers = async (
  deps: AppDeps,
  tenantId: string,
  query: { page?: number; pageSize?: number; q?: string; isActive?: boolean }
): Promise<{ items: (typeof suppliers.$inferSelect)[]; meta: PaginationMeta }> => {
  const pagination = normalizePagination(query);
  const clauses = [
    eq(suppliers.tenantId, tenantId),
    query.q ? sql`${suppliers.name} ilike ${`%${query.q}%`}` : undefined,
    query.isActive !== undefined ? eq(suppliers.isActive, query.isActive) : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);
  const [items, totals] = await Promise.all([
    deps.db
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(asc(suppliers.name))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(suppliers).where(where)
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

export const createSupplier = async (deps: AppDeps, tenantId: string, input: SupplierInput) => {
  const inserted = await deps.db
    .insert(suppliers)
    .values({
      tenantId,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      paymentTerms: input.paymentTermsDays ?? 0
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create supplier');
  return row;
};

export const updateSupplier = async (
  deps: AppDeps,
  tenantId: string,
  id: string,
  input: Partial<SupplierInput> & { isActive?: boolean }
) => {
  const updated = await deps.db
    .update(suppliers)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName ?? null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.address !== undefined ? { address: input.address ?? null } : {}),
      ...(input.paymentTermsDays !== undefined ? { paymentTerms: input.paymentTermsDays } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Supplier not found');
  return row;
};

/** Running supplier balance (payable). */
const supplierBalance = async (tx: Db, tenantId: string, supplierId: string): Promise<bigint> => {
  const rows = await tx
    .select({ balanceAfter: supplierLedgerEntries.balanceAfter })
    .from(supplierLedgerEntries)
    .where(
      and(
        eq(supplierLedgerEntries.tenantId, tenantId),
        eq(supplierLedgerEntries.supplierId, supplierId)
      )
    )
    .orderBy(desc(supplierLedgerEntries.createdAt))
    .limit(1);
  return rows[0] ? toUnits(rows[0].balanceAfter) : 0n;
};

export const recordSupplierLedger = async (
  tx: Db,
  input: {
    tenantId: string;
    supplierId: string;
    entryType: 'PURCHASE' | 'PAYMENT' | 'RETURN' | 'ADJUSTMENT';
    debit?: string;
    credit?: string;
    reference?: string | null;
    createdBy?: string | null;
  }
): Promise<void> => {
  const previous = await supplierBalance(tx, input.tenantId, input.supplierId);
  const debit = toUnits(input.debit ?? '0');
  const credit = toUnits(input.credit ?? '0');
  const balance = add(previous, subtract(debit, credit));
  await tx.insert(supplierLedgerEntries).values({
    tenantId: input.tenantId,
    supplierId: input.supplierId,
    entryType: input.entryType,
    debit: fromUnits(debit),
    credit: fromUnits(credit),
    balanceAfter: fromUnits(balance),
    reference: input.reference ?? null,
    createdBy: input.createdBy ?? null
  });
};

export type PurchaseOrderInput = {
  supplierId: string;
  branchId?: string;
  expectedDate?: string | null;
  notes?: string;
  items: {
    productId: string;
    variantId?: string | null;
    quantity: number;
    unitCost: string;
    taxRate?: string;
  }[];
};

export const createPurchaseOrder = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: PurchaseOrderInput
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  const branchId = await resolveBranch(deps, ctx, input.branchId);

  const orderId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const supplier = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, tenantId)))
      .limit(1);
    if (supplier.length === 0) throw AppError.validation('Supplier not found');

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const found = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));
    if (found.length !== productIds.length)
      throw AppError.validation('One or more products were not found');

    let subtotal = 0n;
    let taxTotal = 0n;
    const lines = input.items.map((item) => {
      const lineSubtotal = toUnits(item.unitCost) * BigInt(item.quantity);
      const lineTax = (lineSubtotal * toUnits(item.taxRate ?? '0')) / 10_000n;
      subtotal = add(subtotal, lineSubtotal);
      taxTotal = add(taxTotal, lineTax);
      return { ...item, lineTotal: add(lineSubtotal, lineTax) };
    });

    const number = await nextDocumentNumber(tx, tenantId, 'PO', 'PO');
    const inserted = await tx
      .insert(purchaseOrders)
      .values({
        tenantId,
        branchId,
        supplierId: input.supplierId,
        number,
        status: 'DRAFT',
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        subtotal: fromUnits(subtotal),
        taxTotal: fromUnits(taxTotal),
        total: fromUnits(add(subtotal, taxTotal)),
        notes: input.notes ?? null,
        createdBy: ctx.userId
      })
      .returning({ id: purchaseOrders.id });
    const order = inserted[0];
    if (!order) throw new Error('Failed to create purchase order');

    await tx.insert(purchaseOrderItems).values(
      lines.map((line) => ({
        purchaseOrderId: order.id,
        productId: line.productId,
        variantId: line.variantId ?? null,
        quantity: line.quantity,
        unitCost: line.unitCost,
        taxRate: line.taxRate ?? '0',
        lineTotal: fromUnits(line.lineTotal)
      }))
    );
    return order.id;
  });

  return getPurchaseOrder(deps, tenantId, orderId);
};

export const getPurchaseOrder = async (deps: AppDeps, tenantId: string, id: string) => {
  const rows = await deps.db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
    .limit(1);
  const order = rows[0];
  if (!order) throw AppError.notFound('Purchase order not found');
  const items = await deps.db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, id));
  const supplier = await deps.db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, order.supplierId))
    .limit(1);
  return { ...order, items, supplier: supplier[0] ?? null };
};

export const listPurchaseOrders = async (
  deps: AppDeps,
  tenantId: string,
  query: {
    page?: number;
    pageSize?: number;
    status?: string;
    supplierId?: string;
    branchId?: string;
  }
) => {
  const pagination = normalizePagination(query);
  const clauses = [
    eq(purchaseOrders.tenantId, tenantId),
    query.status ? sql`${purchaseOrders.status}::text = ${query.status}` : undefined,
    query.supplierId ? eq(purchaseOrders.supplierId, query.supplierId) : undefined,
    query.branchId ? eq(purchaseOrders.branchId, query.branchId) : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);
  const [items, totals] = await Promise.all([
    deps.db
      .select()
      .from(purchaseOrders)
      .where(where)
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(purchaseOrders).where(where)
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

export const setPurchaseOrderStatus = async (
  deps: AppDeps,
  tenantId: string,
  id: string,
  status: 'ORDERED' | 'CANCELLED'
) => {
  const updated = await deps.db
    .update(purchaseOrders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
    .returning({ id: purchaseOrders.id });
  if (updated.length === 0) throw AppError.notFound('Purchase order not found');
  return getPurchaseOrder(deps, tenantId, id);
};

export type ReceiveInput = {
  items: { purchaseOrderItemId: string; quantity: number }[];
  notes?: string;
};

/**
 * Receive goods: creates a goods receipt, moves stock in (PURCHASE) and posts
 * the payable to the supplier ledger — all inside one transaction.
 */
export const receivePurchaseOrder = async (
  deps: AppDeps,
  ctx: RequestContext,
  poId: string,
  input: ReceiveInput
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const receiptId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const rows = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)))
      .for('update')
      .limit(1);
    const po = rows[0];
    if (!po) throw AppError.notFound('Purchase order not found');
    if (po.status === 'CANCELLED')
      throw AppError.unprocessable(
        'invalid_state_transition',
        'Cannot receive a cancelled purchase order'
      );

    const itemRows = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, poId));
    const byId = new Map(itemRows.map((item) => [item.id, item]));

    const number = await nextDocumentNumber(tx, tenantId, 'GRN', 'GRN');
    const inserted = await tx
      .insert(goodsReceipts)
      .values({
        tenantId,
        branchId: po.branchId,
        purchaseOrderId: poId,
        number,
        notes: input.notes ?? null,
        receivedBy: ctx.userId
      })
      .returning({ id: goodsReceipts.id });
    const receipt = inserted[0];
    if (!receipt) throw new Error('Failed to create goods receipt');

    let receivedValue = 0n;
    for (const line of input.items) {
      const item = byId.get(line.purchaseOrderItemId);
      if (!item)
        throw AppError.validation('Unknown purchase order item', {
          items: [line.purchaseOrderItemId]
        });
      if (line.quantity <= 0) throw AppError.validation('Received quantity must be positive');
      const remaining = item.quantity - item.receivedQuantity;
      if (line.quantity > remaining)
        throw AppError.validation('Received quantity exceeds the ordered quantity', {
          items: [item.id]
        });

      await tx.insert(goodsReceiptItems).values({
        receiptId: receipt.id,
        purchaseOrderItemId: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: line.quantity,
        unitCost: item.unitCost
      });
      await tx
        .update(purchaseOrderItems)
        .set({ receivedQuantity: item.receivedQuantity + line.quantity })
        .where(eq(purchaseOrderItems.id, item.id));
      await applyStockMovement(tx, {
        tenantId,
        branchId: po.branchId,
        productId: item.productId,
        variantId: item.variantId,
        delta: line.quantity,
        movementType: 'PURCHASE',
        reason: `Received ${number}`,
        reference: receipt.id,
        unitCost: item.unitCost,
        userId: ctx.userId
      });
      receivedValue = add(receivedValue, toUnits(item.unitCost) * BigInt(line.quantity));
    }

    const updatedItems = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, poId));
    const fullyReceived = updatedItems.every((item) => item.receivedQuantity >= item.quantity);
    await tx
      .update(purchaseOrders)
      .set({ status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED', updatedAt: new Date() })
      .where(eq(purchaseOrders.id, poId));

    await recordSupplierLedger(tx, {
      tenantId,
      supplierId: po.supplierId,
      entryType: 'PURCHASE',
      debit: fromUnits(receivedValue),
      reference: number,
      createdBy: ctx.userId
    });

    return receipt.id;
  });

  const receipt = await deps.db
    .select()
    .from(goodsReceipts)
    .where(eq(goodsReceipts.id, receiptId))
    .limit(1);
  const items = await deps.db
    .select()
    .from(goodsReceiptItems)
    .where(eq(goodsReceiptItems.receiptId, receiptId));
  return { ...receipt[0], items };
};

export const paySupplier = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: {
    supplierId: string;
    amount: string;
    method?: string;
    reference?: string;
    idempotencyKey: string;
  }
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const existing = await deps.db
    .select()
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.tenantId, tenantId),
        eq(supplierPayments.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0];

  await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await tx.insert(supplierPayments).values({
      tenantId,
      supplierId: input.supplierId,
      amount: input.amount,
      method: input.method ?? 'CASH',
      reference: input.reference ?? null,
      idempotencyKey: input.idempotencyKey,
      createdBy: ctx.userId
    });
    await recordSupplierLedger(tx, {
      tenantId,
      supplierId: input.supplierId,
      entryType: 'PAYMENT',
      credit: input.amount,
      reference: input.reference ?? null,
      createdBy: ctx.userId
    });
  });

  const rows = await deps.db
    .select()
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.tenantId, tenantId),
        eq(supplierPayments.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  return rows[0];
};

export const createPurchaseReturn = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: {
    supplierId: string;
    branchId?: string;
    reason?: string;
    items: { productId: string; variantId?: string | null; quantity: number; unitCost: string }[];
  }
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  const branchId = await resolveBranch(deps, ctx, input.branchId);

  const returnId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const number = await nextDocumentNumber(tx, tenantId, 'PRET', 'PRET');
    let total = 0n;
    const lines = input.items.map((item) => {
      const lineTotal = toUnits(item.unitCost) * BigInt(item.quantity);
      total = add(total, lineTotal);
      return { ...item, lineTotal };
    });

    const inserted = await tx
      .insert(purchaseReturns)
      .values({
        tenantId,
        branchId,
        supplierId: input.supplierId,
        number,
        total: fromUnits(total),
        reason: input.reason ?? null,
        createdBy: ctx.userId
      })
      .returning({ id: purchaseReturns.id });
    const ret = inserted[0];
    if (!ret) throw new Error('Failed to create purchase return');

    await tx.insert(purchaseReturnItems).values(
      lines.map((line) => ({
        returnId: ret.id,
        productId: line.productId,
        variantId: line.variantId ?? null,
        quantity: line.quantity,
        unitCost: line.unitCost,
        lineTotal: fromUnits(line.lineTotal)
      }))
    );

    for (const line of lines) {
      await applyStockMovement(tx, {
        tenantId,
        branchId,
        productId: line.productId,
        variantId: line.variantId ?? null,
        delta: -line.quantity,
        movementType: 'RETURN',
        reason: `Purchase return ${number}`,
        reference: ret.id,
        unitCost: line.unitCost,
        userId: ctx.userId
      });
    }

    // A return reduces the amount owed to the supplier.
    await recordSupplierLedger(tx, {
      tenantId,
      supplierId: input.supplierId,
      entryType: 'RETURN',
      credit: fromUnits(total),
      reference: number,
      createdBy: ctx.userId
    });

    return ret.id;
  });

  const rows = await deps.db
    .select()
    .from(purchaseReturns)
    .where(eq(purchaseReturns.id, returnId))
    .limit(1);
  const items = await deps.db
    .select()
    .from(purchaseReturnItems)
    .where(eq(purchaseReturnItems.returnId, returnId));
  return { ...rows[0], items };
};

export const listSupplierLedger = async (deps: AppDeps, tenantId: string, supplierId: string) => {
  const entries = await deps.db
    .select()
    .from(supplierLedgerEntries)
    .where(
      and(
        eq(supplierLedgerEntries.tenantId, tenantId),
        eq(supplierLedgerEntries.supplierId, supplierId)
      )
    )
    .orderBy(desc(supplierLedgerEntries.createdAt))
    .limit(200);
  const balance = await supplierBalance(deps.db, tenantId, supplierId);
  return { entries, balance: fromUnits(balance) };
};
