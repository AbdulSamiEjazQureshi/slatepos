import { Elysia } from 'elysia';
import { and, asc, count, eq, ilike } from '@roms/database';
import { branches, type BranchRow } from '@roms/database';
import {
  branchSchema,
  createBranchSchema,
  listBranchesQuerySchema,
  updateBranchSchema,
  type BranchDto
} from '@roms/contracts/tenants';
import { AppError, normalizePagination } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { hasGlobalBranchAccess, loadPrincipal } from '../../infrastructure/principal';
import { requireTenantId, requireUserId } from '../../lib/context';
import { page } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';

const toBranchDto = (row: BranchRow): BranchDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  code: row.code,
  address: row.address,
  phone: row.phone,
  timezone: row.timezone,
  isDefault: row.isDefault,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const loadTenantBranch = async (
  deps: AppDeps,
  tenantId: string,
  branchId: string
): Promise<BranchRow> => {
  const rows = await deps.db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw AppError.notFound('Branch not found');
  return row;
};

export const branchesModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/branches', tags: ['tenants'] })
    .use(authPlugin(deps))
    .get(
      '/',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const userId = requireUserId(ctx);
        const principal = await loadPrincipal(deps.db, deps.cache, userId);
        const unrestricted = principal ? hasGlobalBranchAccess(principal) : false;

        const pagination = normalizePagination(query);
        const filters = [
          eq(branches.tenantId, tenantId),
          query.q ? ilike(branches.name, `%${query.q}%`) : undefined,
          query.isActive !== undefined ? eq(branches.isActive, query.isActive) : undefined,
          !unrestricted && principal?.branchIds.length
            ? // Only branches the user is a member of.
              and(...principal.branchIds.map((id) => eq(branches.id, id)))
            : undefined
        ].filter((clause) => clause !== undefined);

        const where = and(...filters);
        const [rows, totals] = await Promise.all([
          deps.db
            .select()
            .from(branches)
            .where(where)
            .orderBy(asc(branches.name))
            .limit(pagination.pageSize)
            .offset((pagination.page - 1) * pagination.pageSize),
          deps.db.select({ value: count() }).from(branches).where(where)
        ]);

        return page(rows.map(toBranchDto), totals[0]?.value ?? 0, pagination);
      },
      {
        requireTenant: true,
        query: listBranchesQuerySchema,
        detail: { summary: 'List branches visible to the current user' }
      }
    )
    .post(
      '/',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const inserted = await deps.db
          .insert(branches)
          .values({
            tenantId,
            name: body.name,
            code: body.code,
            address: body.address ?? null,
            phone: body.phone ?? null,
            ...(body.timezone ? { timezone: body.timezone } : {}),
            isDefault: body.isDefault
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error('Failed to create branch');
        await recordAudit(deps.db, ctx, {
          action: 'branch.created',
          entity: 'branch',
          entityId: row.id,
          newValues: { name: row.name, code: row.code }
        });
        return toBranchDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'settings.manage',
        body: createBranchSchema,
        response: { 200: branchSchema },
        detail: { summary: 'Create a branch' }
      }
    )
    .get(
      '/:id',
      async ({ ctx, params }) => {
        const tenantId = requireTenantId(ctx);
        return toBranchDto(await loadTenantBranch(deps, tenantId, params.id));
      },
      {
        requireTenant: true,
        response: { 200: branchSchema },
        detail: { summary: 'Get a branch by id' }
      }
    )
    .patch(
      '/:id',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const current = await loadTenantBranch(deps, tenantId, params.id);
        const updated = await deps.db
          .update(branches)
          .set({
            ...(body.name ? { name: body.name } : {}),
            ...(body.code ? { code: body.code } : {}),
            ...(body.address !== undefined ? { address: body.address ?? null } : {}),
            ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
            ...(body.timezone ? { timezone: body.timezone } : {}),
            ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
            updatedAt: new Date()
          })
          .where(eq(branches.id, current.id))
          .returning();
        const row = updated[0];
        if (!row) throw new Error('Failed to update branch');
        await recordAudit(deps.db, ctx, {
          action: 'branch.updated',
          entity: 'branch',
          entityId: row.id,
          oldValues: { name: current.name, isActive: current.isActive },
          newValues: { name: row.name, isActive: row.isActive }
        });
        return toBranchDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'settings.manage',
        body: updateBranchSchema,
        response: { 200: branchSchema },
        detail: { summary: 'Update a branch' }
      }
    );
