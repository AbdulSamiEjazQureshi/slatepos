import { and, asc, desc, eq, max } from '@roms/database';
import { products, productionRuns, recipeItems, recipes, type Db } from '@roms/database';
import { AppError } from '@roms/utils';
import { MONEY_SCALE, add, applyRate, fromUnits, toUnits } from '@roms/utils/money';
import type { AppDeps } from '../../app/deps';
import type { RequestContext } from '../../lib/context';
import { applyStockMovement } from '../inventory/stock';
import { resolveBranch } from '../orders/orders.service';

export type RecipeItemInput = {
  componentProductId: string;
  quantity: string;
  unit?: string;
  wastageRate?: string;
  unitCost?: string;
};

export type RecipeInput = {
  productId: string;
  name: string;
  yieldQuantity?: string;
  yieldUnit?: string;
  notes?: string;
  items: RecipeItemInput[];
};

/** The fixed-point factor that `rateSchema` column values are scaled by. */
const SCALE_FACTOR = 10n ** BigInt(MONEY_SCALE);

/**
 * What one batch of this recipe should cost, from its lines.
 *
 * `quantity` and `unitCost` are both scaled by `MONEY_SCALE`, so their product
 * is scaled twice and has to be divided back once — dividing by four more
 * orders of magnitude than that costs the whole line. Wastage is a rate, so it
 * scales the quantity *once*, before the price is applied.
 */
const theoreticalCost = (items: RecipeItemInput[]): string => {
  const total = items.reduce((sum, item) => {
    const qty = toUnits(item.quantity);
    const adjusted = qty + applyRate(qty, item.wastageRate ?? '0');
    return add(sum, (adjusted * toUnits(item.unitCost ?? '0')) / SCALE_FACTOR);
  }, 0n);
  return fromUnits(total);
};

export const listRecipes = async (deps: AppDeps, tenantId: string, productId?: string) => {
  const clauses = [
    eq(recipes.tenantId, tenantId),
    productId ? eq(recipes.productId, productId) : undefined
  ].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(recipes)
    .where(and(...clauses))
    .orderBy(asc(recipes.name), desc(recipes.version));
};

export const getRecipe = async (deps: AppDeps, tenantId: string, id: string) => {
  const rows = await deps.db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId)))
    .limit(1);
  const recipe = rows[0];
  if (!recipe) throw AppError.notFound('Recipe not found');
  const items = await deps.db.select().from(recipeItems).where(eq(recipeItems.recipeId, id));
  return { ...recipe, items };
};

export const createRecipe = async (deps: AppDeps, tenantId: string, input: RecipeInput) => {
  return deps.db
    .transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      const product = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.tenantId, tenantId)))
        .limit(1);
      if (product.length === 0) throw AppError.validation('Output product not found');

      const versionRows = await tx
        .select({ value: max(recipes.version) })
        .from(recipes)
        .where(and(eq(recipes.tenantId, tenantId), eq(recipes.productId, input.productId)));
      const version = (versionRows[0]?.value ?? 0) + 1;

      const inserted = await tx
        .insert(recipes)
        .values({
          tenantId,
          productId: input.productId,
          name: input.name,
          version,
          status: 'DRAFT',
          yieldQuantity: input.yieldQuantity ?? '1',
          yieldUnit: input.yieldUnit ?? 'unit',
          theoreticalCost: theoreticalCost(input.items),
          notes: input.notes ?? null
        })
        .returning({ id: recipes.id });
      const recipe = inserted[0];
      if (!recipe) throw new Error('Failed to create recipe');

      await tx.insert(recipeItems).values(
        input.items.map((item) => ({
          recipeId: recipe.id,
          componentProductId: item.componentProductId,
          quantity: item.quantity,
          unit: item.unit ?? 'unit',
          wastageRate: item.wastageRate ?? '0',
          unitCost: item.unitCost ?? '0'
        }))
      );

      return recipe.id;
    })
    .then((id) => getRecipe(deps, tenantId, id));
};

export const setRecipeStatus = async (
  deps: AppDeps,
  tenantId: string,
  id: string,
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
) => {
  const updated = await deps.db
    .update(recipes)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId)))
    .returning({ id: recipes.id });
  if (updated.length === 0) throw AppError.notFound('Recipe not found');
  return getRecipe(deps, tenantId, id);
};

/**
 * Produce a batch: consumes ingredient stock, produces the output product and
 * records a completed production run — transactionally. The recipe version is
 * locked once used so historical costing stays accurate.
 */
export const produceRecipe = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: { recipeId: string; branchId?: string; quantity: number }
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  const branchId = await resolveBranch(deps, ctx, input.branchId);

  const runId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const rows = await tx
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, input.recipeId), eq(recipes.tenantId, tenantId)))
      .for('update')
      .limit(1);
    const recipe = rows[0];
    if (!recipe) throw AppError.notFound('Recipe not found');
    if (recipe.status !== 'ACTIVE')
      throw AppError.unprocessable(
        'invalid_state_transition',
        'Only active recipes can be produced'
      );

    const items = await tx.select().from(recipeItems).where(eq(recipeItems.recipeId, recipe.id));

    let actualCost = 0n;
    for (const item of items) {
      // Wastage is stored as a rate on the same scale as every other rate
      // (`0.1000` is ten per cent). Reading it as a fraction would discard ten
      // per cent of every line's stock and bill the batch against nothing.
      const qty = Math.ceil(
        Number(item.quantity) * (1 + Number(item.wastageRate) / 10 ** MONEY_SCALE) * input.quantity
      );
      await applyStockMovement(tx, {
        tenantId,
        branchId,
        productId: item.componentProductId,
        variantId: null,
        delta: -qty,
        movementType: 'PRODUCTION',
        reason: `Production of ${recipe.name}`,
        reference: recipe.id,
        userId: ctx.userId
      });
      actualCost = add(actualCost, toUnits(item.unitCost) * BigInt(qty));
    }

    const outputQty = Math.max(1, Math.round(Number(recipe.yieldQuantity) * input.quantity));
    await applyStockMovement(tx, {
      tenantId,
      branchId,
      productId: recipe.productId,
      variantId: null,
      delta: outputQty,
      movementType: 'PRODUCTION',
      reason: `Produced ${recipe.name}`,
      reference: recipe.id,
      unitCost: fromUnits(actualCost / BigInt(outputQty)),
      userId: ctx.userId
    });

    const inserted = await tx
      .insert(productionRuns)
      .values({
        tenantId,
        branchId,
        recipeId: recipe.id,
        outputProductId: recipe.productId,
        quantity: input.quantity,
        status: 'COMPLETED',
        actualCost: fromUnits(actualCost),
        producedAt: new Date(),
        createdBy: ctx.userId
      })
      .returning({ id: productionRuns.id });
    const run = inserted[0];
    if (!run) throw new Error('Failed to create production run');

    await tx
      .update(recipes)
      .set({ isLocked: true, updatedAt: new Date() })
      .where(eq(recipes.id, recipe.id));
    return run.id;
  });

  const rows = await deps.db
    .select()
    .from(productionRuns)
    .where(eq(productionRuns.id, runId))
    .limit(1);
  const run = rows[0];
  // Guarded like every sibling read in this file: an unguarded `rows[0]` makes
  // the handler's return type `… | undefined`, which strips the inferred 200
  // from the route and hands the client `unknown` instead of the run.
  if (!run) throw new Error('Failed to read back the production run');
  return run;
};

export const listProductionRuns = async (deps: AppDeps, tenantId: string, limit = 50) =>
  deps.db
    .select()
    .from(productionRuns)
    .where(eq(productionRuns.tenantId, tenantId))
    .orderBy(desc(productionRuns.createdAt))
    .limit(Math.min(limit, 200));
