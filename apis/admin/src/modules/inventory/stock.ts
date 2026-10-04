import { and, eq, isNull } from '@roms/database';
import { stockLevels, stockMovements, type Db } from '@roms/database';
import type { StockMovementType } from '@roms/contracts/enums';
import { AppError } from '@roms/utils';

export type StockMovementInput = {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string | null;
  /** Signed quantity change; negative consumes stock. */
  delta: number;
  movementType: StockMovementType;
  reason: string;
  reference?: string | null;
  unitCost?: string | null;
  userId?: string | null;
};

/**
 * Apply a signed stock change to the level row (locking it) and append an
 * immutable movement record. Never mutates stock without a movement — this is
 * the single place stock quantities change.
 */
export const applyStockMovement = async (tx: Db, input: StockMovementInput): Promise<number> => {
  const existing = await tx
    .select()
    .from(stockLevels)
    .where(
      and(
        eq(stockLevels.branchId, input.branchId),
        eq(stockLevels.productId, input.productId),
        input.variantId ? eq(stockLevels.variantId, input.variantId) : isNull(stockLevels.variantId)
      )
    )
    .for('update')
    .limit(1);

  const current = existing[0];
  const balance = (current?.quantity ?? 0) + input.delta;
  if (balance < 0) {
    throw AppError.unprocessable('insufficient_stock', 'Insufficient stock for this product');
  }

  if (current) {
    await tx
      .update(stockLevels)
      .set({ quantity: balance, updatedAt: new Date() })
      .where(eq(stockLevels.id, current.id));
  } else {
    await tx.insert(stockLevels).values({
      tenantId: input.tenantId,
      branchId: input.branchId,
      productId: input.productId,
      variantId: input.variantId,
      quantity: balance
    });
  }

  await tx.insert(stockMovements).values({
    tenantId: input.tenantId,
    branchId: input.branchId,
    productId: input.productId,
    variantId: input.variantId,
    movementType: input.movementType,
    quantityDelta: input.delta,
    balanceAfter: balance,
    unitCost: input.unitCost ?? null,
    reason: input.reason,
    reference: input.reference ?? null,
    createdBy: input.userId ?? null
  });

  return balance;
};
