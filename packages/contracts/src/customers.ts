import { z } from 'zod';
import { listQuerySchema, moneySchema, uuidSchema } from './common';

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  notes: z.string().trim().max(2000).optional(),
  group: z.string().trim().max(60).optional()
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  group: z.string().nullable(),
  loyaltyPoints: z.number().int(),
  walletBalance: moneySchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CustomerDto = z.infer<typeof customerSchema>;

export const listCustomersQuerySchema = listQuerySchema.extend({
  group: z.string().max(60).optional()
});
