import { z } from 'zod';
import { listQuerySchema, moneySchema, uuidSchema } from './common';
import { productStatusSchema } from './enums';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  parentId: uuidSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categorySchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  parentId: uuidSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CategoryDto = z.infer<typeof categorySchema>;

export const modifierOptionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceDelta: moneySchema.default('0'),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0)
});
export type ModifierOptionInput = z.infer<typeof modifierOptionSchema>;

export const modifierGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  options: z.array(modifierOptionSchema).default([])
});
export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;

export const variantInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sku: z.string().trim().max(64).optional(),
  barcode: z.string().trim().max(64).optional(),
  price: moneySchema,
  costPrice: moneySchema.optional(),
  isDefault: z.boolean().default(false)
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  categoryId: uuidSchema.nullable().optional(),
  sku: z.string().trim().max(64).optional(),
  barcode: z.string().trim().max(64).optional(),
  aliases: z.array(z.string().trim().max(80)).default([]),
  price: moneySchema,
  costPrice: moneySchema.optional(),
  taxRate: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default('0'),
  status: productStatusSchema.default('ACTIVE'),
  isAvailable: z.boolean().default(true),
  trackInventory: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
  variants: z.array(variantInputSchema).default([]),
  modifierGroups: z.array(modifierGroupSchema).default([])
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .partial()
  .omit({ variants: true, modifierGroups: true })
  .extend({
    variants: z.array(variantInputSchema).optional(),
    modifierGroups: z.array(modifierGroupSchema).optional()
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const variantDtoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  price: moneySchema,
  costPrice: moneySchema.nullable(),
  isDefault: z.boolean()
});

export const modifierOptionDtoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  priceDelta: moneySchema,
  isDefault: z.boolean()
});

export const modifierGroupDtoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  isRequired: z.boolean(),
  options: z.array(modifierOptionDtoSchema)
});

export const productSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  categoryId: uuidSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  aliases: z.array(z.string()),
  price: moneySchema,
  costPrice: moneySchema.nullable(),
  taxRate: z.string(),
  status: productStatusSchema,
  isAvailable: z.boolean(),
  trackInventory: z.boolean(),
  imageUrl: z.string().nullable(),
  variants: z.array(variantDtoSchema),
  modifierGroups: z.array(modifierGroupDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ProductDto = z.infer<typeof productSchema>;

export const listProductsQuerySchema = listQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  status: productStatusSchema.optional(),
  isAvailable: z.coerce.boolean().optional()
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

/** Lightweight payload for the POS catalog cache (fast startup). */
export const catalogItemSchema = productSchema.pick({
  id: true,
  name: true,
  price: true,
  categoryId: true,
  isAvailable: true,
  imageUrl: true
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;
