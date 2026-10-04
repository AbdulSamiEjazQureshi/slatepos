import { z } from 'zod';
import { listQuerySchema, moneySchema, uuidSchema } from './common';
import { paymentMethodSchema, paymentStatusSchema } from './enums';

export const createPaymentSchema = z.object({
  orderId: uuidSchema,
  method: paymentMethodSchema,
  amount: moneySchema.refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
  /** Provider reference for external payments (card auth id, wallet txn id). */
  providerReference: z.string().trim().max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Required for all payment mutations; guarantees at-most-once capture. */
  idempotencyKey: z.string().min(8).max(120)
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const refundPaymentSchema = z.object({
  amount: moneySchema
    .refine((value) => Number(value) > 0, 'Amount must be greater than zero')
    .optional(),
  reason: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().min(8).max(120)
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;

export const paymentDtoSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  branchId: uuidSchema,
  orderId: uuidSchema,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  amount: moneySchema,
  refundedAmount: moneySchema,
  currency: z.string(),
  provider: z.string(),
  providerReference: z.string().nullable(),
  idempotencyKey: z.string(),
  capturedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type PaymentDto = z.infer<typeof paymentDtoSchema>;

export const listPaymentsQuerySchema = listQuerySchema.extend({
  orderId: uuidSchema.optional(),
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional()
});

/** A cash-drawer movement (cash in/out, float, drop). */
export const cashMovementSchema = z.object({
  branchId: uuidSchema,
  direction: z.enum(['IN', 'OUT']),
  amount: moneySchema,
  reason: z.string().trim().min(1).max(200)
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
