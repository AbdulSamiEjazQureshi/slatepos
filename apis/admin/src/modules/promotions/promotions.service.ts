import { and, asc, desc, eq, isNull, or, sql } from '@roms/database';
import { promotions } from '@roms/database';
import { AppError } from '@roms/utils';
import { applyRate, clampToZero, compare, fromUnits, toUnits } from '@roms/utils/money';
import type { AppDeps } from '../../app/deps';

export type PromotionInput = {
  name: string;
  type?: 'PERCENT' | 'FIXED' | 'BOGO';
  value: string;
  code?: string | null;
  minOrder?: string;
  maxDiscount?: string | null;
  branchIds?: string[];
  productIds?: string[];
  categoryIds?: string[];
  customerGroup?: string | null;
  usageLimit?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
};

export const listPromotions = async (deps: AppDeps, tenantId: string) =>
  deps.db
    .select()
    .from(promotions)
    .where(eq(promotions.tenantId, tenantId))
    .orderBy(desc(promotions.createdAt));

export const createPromotion = async (deps: AppDeps, tenantId: string, input: PromotionInput) => {
  const inserted = await deps.db
    .insert(promotions)
    .values({
      tenantId,
      name: input.name,
      type: input.type ?? 'PERCENT',
      value: input.value,
      code: input.code ?? null,
      minOrder: input.minOrder ?? '0',
      maxDiscount: input.maxDiscount ?? null,
      branchIds: input.branchIds ?? [],
      productIds: input.productIds ?? [],
      categoryIds: input.categoryIds ?? [],
      customerGroup: input.customerGroup ?? null,
      usageLimit: input.usageLimit ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      isActive: input.isActive ?? true
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create promotion');
  return row;
};

export const updatePromotion = async (
  deps: AppDeps,
  tenantId: string,
  id: string,
  input: Partial<PromotionInput>
) => {
  const updated = await deps.db
    .update(promotions)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.code !== undefined ? { code: input.code ?? null } : {}),
      ...(input.minOrder !== undefined ? { minOrder: input.minOrder } : {}),
      ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount ?? null } : {}),
      ...(input.branchIds ? { branchIds: input.branchIds } : {}),
      ...(input.productIds ? { productIds: input.productIds } : {}),
      ...(input.categoryIds ? { categoryIds: input.categoryIds } : {}),
      ...(input.customerGroup !== undefined ? { customerGroup: input.customerGroup ?? null } : {}),
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit ?? null } : {}),
      ...(input.startDate !== undefined
        ? { startDate: input.startDate ? new Date(input.startDate) : null }
        : {}),
      ...(input.endDate !== undefined
        ? { endDate: input.endDate ? new Date(input.endDate) : null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Promotion not found');
  return row;
};

export type EvaluateInput = {
  subtotal: string;
  code?: string;
  branchId?: string;
  productIds?: string[];
  categoryIds?: string[];
  customerGroup?: string;
};

export type EvaluationResult = { discount: string; promotion: { id: string; name: string } | null };

const intersects = (a: string[], b: string[]): boolean =>
  a.length === 0 || b.length === 0 || a.some((value) => b.includes(value));

/**
 * Evaluate the best applicable promotion server-side. The returned discount is
 * authoritative — client-computed discounts are never trusted.
 */
export const evaluatePromotion = async (
  deps: AppDeps,
  tenantId: string,
  input: EvaluateInput
): Promise<EvaluationResult> => {
  const now = new Date();
  const candidates = await deps.db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.tenantId, tenantId),
        eq(promotions.isActive, true),
        input.code ? eq(promotions.code, input.code) : or(isNull(promotions.code), sql`true`)
      )
    )
    .orderBy(asc(promotions.createdAt));

  const subtotal = toUnits(input.subtotal);
  let best = 0n;
  let bestId: string | null = null;
  let bestName = '';

  for (const promotion of candidates) {
    if (promotion.startDate && promotion.startDate > now) continue;
    if (promotion.endDate && promotion.endDate < now) continue;
    if (promotion.usageLimit !== null && promotion.usedCount >= promotion.usageLimit) continue;
    if (compare(subtotal, toUnits(promotion.minOrder)) < 0) continue;
    if (
      promotion.branchIds.length > 0 &&
      input.branchId &&
      !promotion.branchIds.includes(input.branchId)
    )
      continue;
    if (!intersects(promotion.productIds, input.productIds ?? [])) continue;
    if (!intersects(promotion.categoryIds, input.categoryIds ?? [])) continue;
    if (promotion.customerGroup && promotion.customerGroup !== input.customerGroup) continue;

    let discount =
      promotion.type === 'FIXED' ? toUnits(promotion.value) : applyRate(subtotal, promotion.value);
    if (promotion.maxDiscount)
      discount =
        discount > toUnits(promotion.maxDiscount) ? toUnits(promotion.maxDiscount) : discount;
    discount = clampToZero(discount > subtotal ? subtotal : discount);

    if (discount > best) {
      best = discount;
      bestId = promotion.id;
      bestName = promotion.name;
    }
  }

  return { discount: fromUnits(best), promotion: bestId ? { id: bestId, name: bestName } : null };
};

export const markPromotionUsed = async (
  deps: AppDeps,
  tenantId: string,
  id: string
): Promise<void> => {
  await deps.db
    .update(promotions)
    .set({ usedCount: sql`${promotions.usedCount} + 1`, updatedAt: new Date() })
    .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)));
};
