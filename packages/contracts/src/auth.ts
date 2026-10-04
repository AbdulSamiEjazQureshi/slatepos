import { z } from 'zod';
import { uuidSchema } from './common';
import { roleSchema } from './enums';
import { permissionSchema } from './permissions';

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a digit');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  tenantSlug: z.string().trim().min(1).max(64).optional()
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerTenantSchema = z.object({
  tenantName: z.string().trim().min(2).max(120),
  tenantSlug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug may contain lowercase letters, digits and dashes'),
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  currency: z.string().length(3).default('PKR'),
  timezone: z.string().default('Asia/Karachi'),
  locale: z.string().default('en-PK')
});
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(16).optional()
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(16) });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const OTP_PURPOSES = ['EMAIL_VERIFICATION', 'LOGIN', 'PASSWORD_RESET'] as const;
export const otpPurposeSchema = z.enum(OTP_PURPOSES);
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const requestOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(200),
  purpose: otpPurposeSchema
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(200),
  code: z.string().regex(/^\d{4,8}$/),
  purpose: otpPurposeSchema
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().optional()
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const sessionSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  tenantId: uuidSchema.nullable(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable()
});
export type SessionDto = z.infer<typeof sessionSchema>;

/** The authenticated principal returned by `/auth/me`. */
export const currentUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  fullName: z.string(),
  status: z.string(),
  isPlatformAdmin: z.boolean(),
  tenantId: uuidSchema.nullable(),
  tenantSlug: z.string().nullable(),
  branchIds: z.array(uuidSchema),
  roles: z.array(roleSchema),
  permissions: z.array(permissionSchema)
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** The lighter user shape returned alongside a fresh token pair. */
export const authUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  fullName: z.string(),
  tenantId: uuidSchema.nullable(),
  isPlatformAdmin: z.boolean(),
  roles: z.array(z.string())
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResultSchema = z.object({
  user: authUserSchema,
  tokens: tokenPairSchema
});
export type AuthResultDto = z.infer<typeof authResultSchema>;

export const otpRequestResultSchema = z.object({ sent: z.literal(true) });
export const otpVerifyResultSchema = z.object({
  verified: z.literal(true),
  tokens: tokenPairSchema.optional()
});
export const okResultSchema = z.object({ ok: z.literal(true) });
