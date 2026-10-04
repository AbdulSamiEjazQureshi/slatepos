import { z } from 'zod';
import { listQuerySchema, moneySchema, uuidSchema } from './common';
import { stockMovementTypeSchema } from './enums';

export const stockAdjustmentSchema = z.object({
  branchId: uuidSchema.optional(),
  productId: uuidSchema,
  variantId: uuidSchema.nullable().optional(),
  /** Signed quantity change in product units. Negative consumes stock. */
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0, 'Delta must not be zero'),
  movementType: stockMovementTypeSchema,
  reason: z.string().trim().min(1).max(200),
  /** Optional unit cost for valuation of inbound movements. */
  unitCost: moneySchema.optional(),
  reference: z.string().trim().max(120).optional()
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const stockTransferSchema = z.object({
  fromBranchId: uuidSchema,
  toBranchId: uuidSchema,
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        variantId: uuidSchema.nullable().optional(),
        quantity: z.number().int().positive()
      })
    )
    .min(1),
  reason: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().min(8).max(120).optional()
});
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

export const stockLevelDtoSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  branchId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  quantity: z.number().int(),
  reorderPoint: z.number().int(),
  updatedAt: z.string()
});
export type StockLevelDto = z.infer<typeof stockLevelDtoSchema>;

/**
 * The stock list as the route actually returns it: a projection of the level
 * joined to the product's name, and without the tenant/variant columns the
 * generic DTO carries. Kept separate so the wire response can be declared.
 */
export const stockRowSchema = z.object({
  id: uuidSchema,
  branchId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  productName: z.string(),
  quantity: z.number().int(),
  reorderPoint: z.number().int(),
  updatedAt: z.string()
});
export type StockRow = z.infer<typeof stockRowSchema>;

export const stockAdjustmentResultSchema = z.object({
  productId: uuidSchema,
  balance: z.number().int()
});

export const stockTransferResultSchema = z.object({
  transferred: z.number().int()
});

export const stockMovementDtoSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  branchId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  movementType: stockMovementTypeSchema,
  quantityDelta: z.number().int(),
  balanceAfter: z.number().int(),
  unitCost: moneySchema.nullable(),
  reason: z.string(),
  reference: z.string().nullable(),
  createdBy: uuidSchema.nullable(),
  createdAt: z.string()
});
export type StockMovementDto = z.infer<typeof stockMovementDtoSchema>;

export const listStockQuerySchema = listQuerySchema.extend({
  branchId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  lowOnly: z.coerce.boolean().optional()
});

export const listMovementsQuerySchema = listQuerySchema.extend({
  branchId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  movementType: stockMovementTypeSchema.optional()
});
