import { z } from 'zod';

export const taxRuleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Decimal rate, e.g. "0.05" for 5%. */
  rate: z.string().regex(/^\d+(\.\d{1,4})?$/),
  inclusive: z.boolean().default(false),
  appliesTo: z.enum(['ALL', 'PRODUCT', 'CATEGORY']).default('ALL')
});
export type TaxRule = z.infer<typeof taxRuleSchema>;

export const tenantSettingsSchema = z.object({
  currency: z.string().length(3).default('PKR'),
  timezone: z.string().default('Asia/Karachi'),
  locale: z.string().default('en-PK'),
  taxRules: z.array(taxRuleSchema).default([]),
  serviceChargeRate: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default('0'),
  receiptFooter: z.string().max(400).nullable().default(null),
  orderPrefix: z.string().trim().max(8).default('ORD')
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  locale: 'en-PK',
  taxRules: [],
  serviceChargeRate: '0',
  receiptFooter: null,
  orderPrefix: 'ORD'
};

export const brandingSchema = z.object({
  logoUrl: z.string().url().nullable().default(null),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#111827'),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#f59e0b'),
  fontFamily: z.string().max(80).default('Inter')
});
export type Branding = z.infer<typeof brandingSchema>;
