import { z } from 'zod';
import { listQuerySchema, uuidSchema } from './common';
import { userStatusSchema } from './enums';
import { emailSchema } from './auth';

export const createUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(10).max(200),
  roles: z.array(z.string().min(1)).min(1).default(['CASHIER']),
  branchIds: z.array(uuidSchema).default([]),
  status: userStatusSchema.default('ACTIVE')
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  status: userStatusSchema.optional(),
  roles: z.array(z.string().min(1)).min(1).optional(),
  branchIds: z.array(uuidSchema).optional()
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema.nullable(),
  email: z.string(),
  fullName: z.string(),
  status: userStatusSchema,
  isPlatformAdmin: z.boolean(),
  roles: z.array(z.string()),
  branchIds: z.array(uuidSchema),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type UserDto = z.infer<typeof userSchema>;

export const listUsersQuerySchema = listQuerySchema.extend({
  status: userStatusSchema.optional(),
  role: z.string().optional()
});

export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Use SCREAMING_SNAKE_CASE'),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string().min(1)).default([])
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const roleDtoSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type RoleDto = z.infer<typeof roleDtoSchema>;
