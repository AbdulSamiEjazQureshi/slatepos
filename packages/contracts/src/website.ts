import { z } from 'zod';
import { uuidSchema } from './common';
import { brandingSchema, type Branding } from './settings';

export { brandingSchema };
export type { Branding };

/**
 * Public website content is structured data — never arbitrary HTML or JS. The
 * same schema validates AI-generated layouts before they are stored.
 */
export const heroSectionSchema = z.object({
  type: z.literal('hero'),
  variant: z.enum(['split', 'centered', 'banner']).default('split'),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(240).optional(),
  imageUrl: z.string().url().optional(),
  theme: z.enum(['light', 'dark']).default('dark')
});

export const categoriesSectionSchema = z.object({
  type: z.literal('categories'),
  title: z.string().trim().max(120).optional()
});

export const productsSectionSchema = z.object({
  type: z.literal('products'),
  title: z.string().trim().max(120).optional(),
  categoryId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(48).default(12)
});

export const bannerSectionSchema = z.object({
  type: z.literal('banner'),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional()
});

export const promotionSectionSchema = z.object({
  type: z.literal('promotion'),
  title: z.string().trim().min(1).max(120),
  text: z.string().trim().max(240),
  code: z.string().trim().max(40).optional()
});

export const pageSectionSchema = z.discriminatedUnion('type', [
  heroSectionSchema,
  categoriesSectionSchema,
  productsSectionSchema,
  bannerSectionSchema,
  promotionSectionSchema
]);
export type PageSection = z.infer<typeof pageSectionSchema>;

export const updateWebsiteSettingsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  isPublished: z.boolean().optional(),
  brand: brandingSchema.partial().optional(),
  seoTitle: z.string().trim().max(160).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  sections: z.array(pageSectionSchema).max(20).optional()
});
export type UpdateWebsiteSettingsInput = z.infer<typeof updateWebsiteSettingsSchema>;

export const upsertWebsitePageSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(160),
  sortOrder: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(true),
  sections: z.array(pageSectionSchema).max(20).default([])
});
export type UpsertWebsitePageInput = z.infer<typeof upsertWebsitePageSchema>;
