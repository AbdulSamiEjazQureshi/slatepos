import { and, count, desc, eq, sql } from '@roms/database';
import { products, stockLevels, stockMovements, type Db } from '@roms/database';
import type {
  StockAdjustmentInput,
  StockMovementDto,
  StockRow,
  StockTransferInput
} from '@roms/contracts/inventory';
import type { StockMovementType } from '@roms/contracts/enums';
import { AppError, normalizePagination, type PaginationMeta } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import type { RequestContext } from '../../lib/context';
import { resolveBranch } from '../orders/orders.service';
import { applyStockMovement } from './stock';

export type StockListFilters = {
  page?: number;
  pageSize?: number;
  branchId?: string;
  productId?: string;
  lowOnly?: boolean;
};

export const listStock = async (
  deps: AppDeps,
  tenantId: string,
  filters: StockListFilters
): Promise<{ items: StockRow[]; meta: PaginationMeta }> => {
  const pagination = normalizePagination(filters);
  const clauses = [
    eq(stockLevels.tenantId, tenantId),
    filters.branchId ? eq(stockLevels.branchId, filters.branchId) : undefined,
    filters.productId ? eq(stockLevels.productId, filters.productId) : undefined,
    filters.lowOnly ? sql`${stockLevels.quantity} <= ${stockLevels.reorderPoint}` : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);

  const [rows, totals] = await Promise.all([
    deps.db
      .select({
        id: stockLevels.id,
        branchId: stockLevels.branchId,
        productId: stockLevels.productId,
        variantId: stockLevels.variantId,
        productName: products.name,
        quantity: stockLevels.quantity,
        reorderPoint: stockLevels.reorderPoint,
        updatedAt: stockLevels.updatedAt
      })
      .from(stockLevels)
      .innerJoin(products, eq(products.id, stockLevels.productId))
      .where(where)
      .orderBy(products.name)
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(stockLevels).where(where)
  ]);

  const total = totals[0]?.value ?? 0;
  const totalPages = Math.ceil(total / pagination.pageSize);
  return {
    items: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
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

export const listMovements = async (
  deps: AppDeps,
  tenantId: string,
  filters: StockListFilters & { movementType?: StockMovementType }
): Promise<{ items: StockMovementDto[]; meta: PaginationMeta }> => {
  const pagination = normalizePagination(filters);
  const clauses = [
    eq(stockMovements.tenantId, tenantId),
    filters.branchId ? eq(stockMovements.branchId, filters.branchId) : undefined,
    filters.productId ? eq(stockMovements.productId, filters.productId) : undefined,
    filters.movementType ? eq(stockMovements.movementType, filters.movementType) : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);

  const [rows, totals] = await Promise.all([
    deps.db
      .select()
      .from(stockMovements)
      .where(where)
      .orderBy(desc(stockMovements.createdAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(stockMovements).where(where)
  ]);

  const total = totals[0]?.value ?? 0;
  const totalPages = Math.ceil(total / pagination.pageSize);
  return {
    items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
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

export const adjustStock = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: StockAdjustmentInput
): Promise<{ productId: string; balance: number }> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  const branchId = await resolveBranch(deps, ctx, input.branchId);

  const balance = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    return applyStockMovement(tx, {
      tenantId,
      branchId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      delta: input.quantityDelta,
      movementType: input.movementType,
      reason: input.reason,
      reference: input.reference ?? null,
      unitCost: input.unitCost ?? null,
      userId: ctx.userId
    });
  });

  return { productId: input.productId, balance };
};

export const transferStock = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: StockTransferInput
): Promise<{ transferred: number }> => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  if (input.fromBranchId === input.toBranchId) {
    throw AppError.validation('Source and destination branches must differ');
  }
  // Authorise both sides of the transfer.
  await resolveBranch(deps, ctx, input.fromBranchId);
  await resolveBranch(deps, ctx, input.toBranchId);

  const reference = input.idempotencyKey ?? `transfer:${crypto.randomUUID()}`;

  await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    for (const item of input.items) {
      await applyStockMovement(tx, {
        tenantId,
        branchId: input.fromBranchId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        delta: -item.quantity,
        movementType: 'TRANSFER_OUT',
        reason: input.reason ?? 'Stock transfer',
        reference,
        userId: ctx.userId
      });
      await applyStockMovement(tx, {
        tenantId,
        branchId: input.toBranchId,
        productId: item.productId,
        variantId: item.variantId ?? null,
        delta: item.quantity,
        movementType: 'TRANSFER_IN',
        reason: input.reason ?? 'Stock transfer',
        reference,
        userId: ctx.userId
      });
    }
  });

  return { transferred: input.items.length };
};
