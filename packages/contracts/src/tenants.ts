import { z } from 'zod';
import { listQuerySchema, uuidSchema } from './common';
import { tenantStatusSchema } from './enums';
import { tenantSettingsSchema } from './settings';
import { emailSchema } from './auth';

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  legalName: z.string().trim().max(200).optional(),
  settings: tenantSettingsSchema.partial().optional()
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = createTenantSchema.partial().extend({
  status: tenantStatusSchema.optional()
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const tenantSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  legalName: z.string().nullable(),
  status: tenantStatusSchema,
  settings: tenantSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type TenantDto = z.infer<typeof tenantSchema>;

export const listTenantsQuerySchema = listQuerySchema.extend({
  status: tenantStatusSchema.optional()
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/, 'Code may contain letters, digits and dashes'),
  address: z.string().trim().max(400).optional(),
  phone: z.string().trim().max(40).optional(),
  timezone: z.string().optional(),
  isDefault: z.boolean().default(false)
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional()
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const branchSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string(),
  code: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  timezone: z.string(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type BranchDto = z.infer<typeof branchSchema>;

export const listBranchesQuerySchema = listQuerySchema.extend({
  isActive: z.coerce.boolean().optional()
});

export const inviteUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120),
  role: z.string().min(1),
  branchIds: z.array(uuidSchema).default([])
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
