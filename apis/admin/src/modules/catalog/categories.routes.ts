import { Elysia } from 'elysia';
import { and, asc, count, eq, ilike } from '@roms/database';
import { categories, type CategoryRow } from '@roms/database';
import {
  categorySchema,
  createCategorySchema,
  updateCategorySchema,
  type CategoryDto
} from '@roms/contracts/catalog';
import { listQuerySchema } from '@roms/contracts/common';
import { AppError, normalizePagination } from '@roms/utils';
import { z } from 'zod';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { page } from '../../lib/http';
import { authPlugin } from '../../plugins/auth';

const toCategoryDto = (row: CategoryRow): CategoryDto => ({
  id: row.id,
  tenantId: row.tenantId,
  parentId: row.parentId,
  name: row.name,
  description: row.description,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const listCategoriesQuery = listQuerySchema.extend({
  parentId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional()
});

export const categoriesModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/categories', tags: ['catalog'] })
    .use(authPlugin(deps))
    .get(
      '/',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const pagination = normalizePagination(query);
        const clauses = [
          eq(categories.tenantId, tenantId),
          query.q ? ilike(categories.name, `%${query.q}%`) : undefined,
          query.parentId ? eq(categories.parentId, query.parentId) : undefined,
          query.isActive !== undefined ? eq(categories.isActive, query.isActive) : undefined
        ].filter((clause) => clause !== undefined);
        const where = and(...clauses);

        const [rows, totals] = await Promise.all([
          deps.db
            .select()
            .from(categories)
            .where(where)
            .orderBy(asc(categories.sortOrder), asc(categories.name))
            .limit(pagination.pageSize)
            .offset((pagination.page - 1) * pagination.pageSize),
          deps.db.select({ value: count() }).from(categories).where(where)
        ]);
        return page(rows.map(toCategoryDto), totals[0]?.value ?? 0, pagination);
      },
      {
        requireTenant: true,
        requirePermission: 'categories.read',
        query: listCategoriesQuery,
        detail: { summary: 'List categories' }
      }
    )
    .post(
      '/',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        if (body.parentId) {
          const parent = await deps.db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.id, body.parentId), eq(categories.tenantId, tenantId)))
            .limit(1);
          if (parent.length === 0) throw AppError.validation('Parent category not found');
        }
        const inserted = await deps.db
          .insert(categories)
          .values({
            tenantId,
            name: body.name,
            description: body.description ?? null,
            parentId: body.parentId ?? null,
            sortOrder: body.sortOrder,
            isActive: body.isActive
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error('Failed to create category');
        return toCategoryDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'categories.manage',
        body: createCategorySchema,
        response: { 200: categorySchema },
        detail: { summary: 'Create a category' }
      }
    )
    .get(
      '/:id',
      async ({ ctx, params }) => {
        const rows = await deps.db
          .select()
          .from(categories)
          .where(and(eq(categories.id, params.id), eq(categories.tenantId, requireTenantId(ctx))))
          .limit(1);
        const row = rows[0];
        if (!row) throw AppError.notFound('Category not found');
        return toCategoryDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'categories.read',
        response: { 200: categorySchema },
        detail: { summary: 'Get a category by id' }
      }
    )
    .patch(
      '/:id',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const updated = await deps.db
          .update(categories)
          .set({
            ...(body.name ? { name: body.name } : {}),
            ...(body.description !== undefined ? { description: body.description ?? null } : {}),
            ...(body.parentId !== undefined ? { parentId: body.parentId ?? null } : {}),
            ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
            updatedAt: new Date()
          })
          .where(and(eq(categories.id, params.id), eq(categories.tenantId, tenantId)))
          .returning();
        const row = updated[0];
        if (!row) throw AppError.notFound('Category not found');
        return toCategoryDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'categories.manage',
        body: updateCategorySchema,
        response: { 200: categorySchema },
        detail: { summary: 'Update a category' }
      }
    )
    .delete(
      '/:id',
      async ({ ctx, params }) => {
        const tenantId = requireTenantId(ctx);
        // Soft delete keeps historical order references valid.
        const updated = await deps.db
          .update(categories)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(categories.id, params.id), eq(categories.tenantId, tenantId)))
          .returning({ id: categories.id });
        if (updated.length === 0) throw AppError.notFound('Category not found');
        return { ok: true as const };
      },
      {
        requireTenant: true,
        requirePermission: 'categories.manage',
        detail: { summary: 'Deactivate a category (soft delete)' }
      }
    );
