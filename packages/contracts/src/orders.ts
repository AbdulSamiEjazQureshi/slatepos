import { z } from 'zod';
import { listQuerySchema, moneySchema, rateSchema, uuidSchema } from './common';
import { orderItemStatusSchema, orderStatusSchema, orderTypeSchema } from './enums';

export const orderModifierSelectionSchema = z.object({
  modifierOptionId: uuidSchema,
  quantity: z.number().int().min(1).default(1)
});

export const orderLineInputSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.nullable().optional(),
  quantity: z.number().int().min(1).max(999),
  modifiers: z.array(orderModifierSelectionSchema).default([]),
  notes: z.string().trim().max(300).optional(),
  /** Manual price override; requires the `orders.update` permission. */
  priceOverride: moneySchema.nullable().optional()
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export const discountSchema = z.object({
  type: z.enum(DISCOUNT_TYPES),
  /** Percent (e.g. "0.10") or fixed amount, interpreted by `type`. */
  value: rateSchema,
  reason: z.string().trim().max(200).optional()
});
export type DiscountInput = z.infer<typeof discountSchema>;

export const createOrderSchema = z.object({
  type: orderTypeSchema.default('DINE_IN'),
  branchId: uuidSchema.optional(),
  tableId: uuidSchema.nullable().optional(),
  customerId: uuidSchema.nullable().optional(),
  items: z.array(orderLineInputSchema).min(1, 'An order needs at least one item'),
  discount: discountSchema.nullable().optional(),
  /** Gratuity as a fixed amount. */
  tip: moneySchema.default('0'),
  notes: z.string().trim().max(500).optional(),
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
  /** Client-supplied key that makes order creation idempotent. */
  idempotencyKey: z.string().min(8).max(120).optional()
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = z.object({
  items: z.array(orderLineInputSchema).min(1).optional(),
  discount: discountSchema.nullable().optional(),
  tip: moneySchema.optional(),
  notes: z.string().trim().max(500).optional(),
  tableId: uuidSchema.nullable().optional(),
  customerId: uuidSchema.nullable().optional(),
  version: z.number().int().nonnegative().optional()
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  reason: z.string().trim().max(200).optional()
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const updateOrderItemStatusSchema = z.object({
  status: orderItemStatusSchema
});

export const orderTotalsSchema = z.object({
  subtotal: moneySchema,
  discountTotal: moneySchema,
  taxTotal: moneySchema,
  serviceCharge: moneySchema,
  tip: moneySchema,
  deliveryFee: moneySchema,
  grandTotal: moneySchema
});
export type OrderTotals = z.infer<typeof orderTotalsSchema>;

export const orderLineDtoSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema.nullable(),
  variantId: uuidSchema.nullable(),
  name: z.string(),
  quantity: z.number().int(),
  unitPrice: moneySchema,
  lineTotal: moneySchema,
  taxAmount: moneySchema,
  discountAmount: moneySchema,
  status: orderItemStatusSchema,
  notes: z.string().nullable(),
  modifiers: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      priceDelta: moneySchema
    })
  )
});
export type OrderLineDto = z.infer<typeof orderLineDtoSchema>;

export const orderDtoSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  branchId: uuidSchema,
  number: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  tableId: uuidSchema.nullable(),
  customerId: uuidSchema.nullable(),
  cashierId: uuidSchema.nullable(),
  totals: orderTotalsSchema,
  notes: z.string().nullable(),
  items: z.array(orderLineDtoSchema),
  version: z.number().int(),
  scheduledFor: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type OrderDto = z.infer<typeof orderDtoSchema>;

export const listOrdersQuerySchema = listQuerySchema.extend({
  status: orderStatusSchema.optional(),
  type: orderTypeSchema.optional(),
  branchId: uuidSchema.optional(),
  tableId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional()
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
