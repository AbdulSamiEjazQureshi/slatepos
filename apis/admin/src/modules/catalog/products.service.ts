import { and, asc, count, desc, eq, ilike, inArray, or, sql } from '@roms/database';
import {
  categories,
  modifierGroups,
  modifierOptions,
  productModifierGroups,
  productVariants,
  products,
  type Db,
  type ProductRow
} from '@roms/database';
import type { CreateProductInput, ProductDto, UpdateProductInput } from '@roms/contracts/catalog';
import type { ListQuery } from '@roms/contracts/common';
import type { ProductStatus } from '@roms/contracts/enums';
import { AppError, normalizePagination, type PaginationMeta } from '@roms/utils';
import type { AppDeps } from '../../app/deps';

const toVariantDto = (row: typeof productVariants.$inferSelect) => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode,
  price: row.price,
  costPrice: row.costPrice,
  isDefault: row.isDefault
});

type ModifierGroupDto = ProductDto['modifierGroups'][number];

const toGroupDto = (
  group: typeof modifierGroups.$inferSelect,
  options: (typeof modifierOptions.$inferSelect)[]
): ModifierGroupDto => ({
  id: group.id,
  name: group.name,
  minSelect: group.minSelect,
  maxSelect: group.maxSelect,
  isRequired: group.isRequired,
  options: options.map((option) => ({
    id: option.id,
    name: option.name,
    priceDelta: option.priceDelta,
    isDefault: option.isDefault
  }))
});

/** Load variants + modifier groups/options for a batch of products (no N+1). */
const loadDetail = async (db: Db, productIds: string[]) => {
  if (productIds.length === 0) {
    return {
      variantsByProduct: new Map<string, (typeof productVariants.$inferSelect)[]>(),
      groupsByProduct: new Map<string, ModifierGroupDto[]>()
    };
  }

  const [variantRows, linkRows] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, productIds))
      .orderBy(asc(productVariants.name)),
    db
      .select()
      .from(productModifierGroups)
      .innerJoin(modifierGroups, eq(modifierGroups.id, productModifierGroups.groupId))
      .where(inArray(productModifierGroups.productId, productIds))
  ]);

  const groupIds = linkRows.map((row) => row.modifier_groups.id);
  const optionRows =
    groupIds.length > 0
      ? await db
          .select()
          .from(modifierOptions)
          .where(inArray(modifierOptions.groupId, groupIds))
          .orderBy(asc(modifierOptions.sortOrder))
      : [];

  const variantsByProduct = new Map<string, (typeof productVariants.$inferSelect)[]>();
  for (const variant of variantRows) {
    variantsByProduct.set(variant.productId, [
      ...(variantsByProduct.get(variant.productId) ?? []),
      variant
    ]);
  }

  const groupsByProduct = new Map<string, ModifierGroupDto[]>();
  for (const link of linkRows) {
    const group = link.modifier_groups;
    const dto = toGroupDto(
      group,
      optionRows.filter((option) => option.groupId === group.id)
    );
    groupsByProduct.set(link.product_modifier_groups.productId, [
      ...(groupsByProduct.get(link.product_modifier_groups.productId) ?? []),
      dto
    ]);
  }

  return { variantsByProduct, groupsByProduct };
};

const toProductDto = (
  row: ProductRow,
  variants: (typeof productVariants.$inferSelect)[],
  groups: ModifierGroupDto[]
): ProductDto => ({
  id: row.id,
  tenantId: row.tenantId,
  categoryId: row.categoryId,
  name: row.name,
  description: row.description,
  sku: row.sku,
  barcode: row.barcode,
  aliases: row.aliases,
  price: row.price,
  costPrice: row.costPrice,
  taxRate: row.taxRate,
  status: row.status,
  isAvailable: row.isAvailable,
  trackInventory: row.trackInventory,
  imageUrl: row.imageUrl,
  variants: variants.map(toVariantDto),
  modifierGroups: groups,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export type ProductListFilters = ListQuery & {
  categoryId?: string;
  status?: ProductStatus;
  isAvailable?: boolean;
};

export const listProducts = async (
  deps: AppDeps,
  tenantId: string,
  filters: ProductListFilters
): Promise<{ items: ProductDto[]; meta: PaginationMeta }> => {
  const pagination = normalizePagination(filters);
  const clauses = [
    eq(products.tenantId, tenantId),
    filters.categoryId ? eq(products.categoryId, filters.categoryId) : undefined,
    filters.status ? eq(products.status, filters.status) : undefined,
    filters.isAvailable !== undefined ? eq(products.isAvailable, filters.isAvailable) : undefined,
    filters.q
      ? or(
          ilike(products.name, `%${filters.q}%`),
          ilike(products.sku, `%${filters.q}%`),
          ilike(products.barcode, `%${filters.q}%`),
          sql`${products.aliases}::text ilike ${`%${filters.q}%`}`
        )
      : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);
  const sortColumn =
    filters.sort === 'name'
      ? products.name
      : filters.sort === 'price'
        ? products.price
        : products.createdAt;
  const sortDirection = filters.order === 'asc' ? asc : desc;

  const [rows, totals] = await Promise.all([
    deps.db
      .select()
      .from(products)
      .where(where)
      .orderBy(sortDirection(sortColumn), asc(products.id))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(products).where(where)
  ]);

  const { variantsByProduct, groupsByProduct } = await loadDetail(
    deps.db,
    rows.map((row) => row.id)
  );
  const total = totals[0]?.value ?? 0;
  const totalPages = Math.ceil(total / pagination.pageSize);

  return {
    items: rows.map((row) =>
      toProductDto(row, variantsByProduct.get(row.id) ?? [], groupsByProduct.get(row.id) ?? [])
    ),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrevious: pagination.page > 1
    }
  };
};

export const getProduct = async (
  deps: AppDeps,
  tenantId: string,
  id: string
): Promise<ProductDto> => {
  const rows = await deps.db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw AppError.notFound('Product not found');
  const { variantsByProduct, groupsByProduct } = await loadDetail(deps.db, [row.id]);
  return toProductDto(row, variantsByProduct.get(row.id) ?? [], groupsByProduct.get(row.id) ?? []);
};

/** Fast POS search over name, SKU, barcode and aliases. */
export const searchProducts = async (
  deps: AppDeps,
  tenantId: string,
  term: string,
  limit = 20
): Promise<ProductDto[]> => {
  const pattern = `%${term}%`;
  const rows = await deps.db
    .select()
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.status, 'ACTIVE'),
        or(
          ilike(products.name, pattern),
          ilike(products.sku, pattern),
          ilike(products.barcode, pattern),
          sql`${products.aliases}::text ilike ${pattern}`
        )
      )
    )
    .orderBy(asc(products.name))
    .limit(Math.min(limit, 50));

  const { variantsByProduct, groupsByProduct } = await loadDetail(
    deps.db,
    rows.map((row) => row.id)
  );
  return rows.map((row) =>
    toProductDto(row, variantsByProduct.get(row.id) ?? [], groupsByProduct.get(row.id) ?? [])
  );
};

export const createProduct = async (
  deps: AppDeps,
  tenantId: string,
  input: CreateProductInput
): Promise<ProductDto> => {
  const productId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;

    if (input.categoryId) {
      const category = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.categoryId), eq(categories.tenantId, tenantId)))
        .limit(1);
      if (category.length === 0) {
        throw AppError.validation('Invalid category', { categoryId: ['Category not found'] });
      }
    }

    const inserted = await tx
      .insert(products)
      .values({
        tenantId,
        categoryId: input.categoryId ?? null,
        name: input.name,
        description: input.description ?? null,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        aliases: input.aliases,
        price: input.price,
        costPrice: input.costPrice ?? null,
        taxRate: input.taxRate,
        status: input.status,
        isAvailable: input.isAvailable,
        trackInventory: input.trackInventory,
        imageUrl: input.imageUrl ?? null
      })
      .returning({ id: products.id });
    const product = inserted[0];
    if (!product) throw new Error('Failed to create product');

    if (input.variants.length > 0) {
      await tx.insert(productVariants).values(
        input.variants.map((variant) => ({
          tenantId,
          productId: product.id,
          name: variant.name,
          sku: variant.sku ?? null,
          barcode: variant.barcode ?? null,
          price: variant.price,
          costPrice: variant.costPrice ?? null,
          isDefault: variant.isDefault
        }))
      );
    }

    for (const [index, group] of input.modifierGroups.entries()) {
      const groupRows = await tx
        .insert(modifierGroups)
        .values({
          tenantId,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          isRequired: group.isRequired
        })
        .returning({ id: modifierGroups.id });
      const created = groupRows[0];
      if (!created) continue;
      if (group.options.length > 0) {
        await tx.insert(modifierOptions).values(
          group.options.map((option) => ({
            groupId: created.id,
            name: option.name,
            priceDelta: option.priceDelta,
            isDefault: option.isDefault,
            sortOrder: option.sortOrder
          }))
        );
      }
      await tx
        .insert(productModifierGroups)
        .values({ productId: product.id, groupId: created.id, sortOrder: index });
    }

    return product.id;
  });

  return getProduct(deps, tenantId, productId);
};

export const updateProduct = async (
  deps: AppDeps,
  tenantId: string,
  id: string,
  input: UpdateProductInput
): Promise<ProductDto> => {
  const updated = await deps.db
    .update(products)
    .set({
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.sku !== undefined ? { sku: input.sku ?? null } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode ?? null } : {}),
      ...(input.aliases ? { aliases: input.aliases } : {}),
      ...(input.price ? { price: input.price } : {}),
      ...(input.costPrice !== undefined ? { costPrice: input.costPrice ?? null } : {}),
      ...(input.taxRate ? { taxRate: input.taxRate } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
      ...(input.trackInventory !== undefined ? { trackInventory: input.trackInventory } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .returning({ id: products.id });
  if (updated.length === 0) throw AppError.notFound('Product not found');
  return getProduct(deps, tenantId, id);
};

export const archiveProduct = async (
  deps: AppDeps,
  tenantId: string,
  id: string
): Promise<void> => {
  const updated = await deps.db
    .update(products)
    .set({ status: 'ARCHIVED', isAvailable: false, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .returning({ id: products.id });
  if (updated.length === 0) throw AppError.notFound('Product not found');
};
