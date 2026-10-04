import { Elysia } from 'elysia';
import { and, count, desc, eq, ilike } from '@roms/database';
import { tenants, type TenantRow } from '@roms/database';
import {
  createTenantSchema,
  listTenantsQuerySchema,
  tenantSchema,
  updateTenantSchema,
  type TenantDto
} from '@roms/contracts/tenants';
import { DEFAULT_TENANT_SETTINGS, tenantSettingsSchema } from '@roms/contracts/settings';
import { normalizePagination } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { page } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';

const toTenantDto = (row: TenantRow): TenantDto => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  legalName: row.legalName,
  status: row.status,
  settings: row.settings ?? DEFAULT_TENANT_SETTINGS,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export const tenantsModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/tenants', tags: ['tenants'] })
    .use(authPlugin(deps))
    .get(
      '/',
      async ({ query }) => {
        const pagination = normalizePagination(query);
        const filters = [
          query.status ? eq(tenants.status, query.status) : undefined,
          query.q ? ilike(tenants.name, `%${query.q}%`) : undefined
        ].filter((clause) => clause !== undefined);
        const where = filters.length > 0 ? and(...filters) : undefined;

        const [rows, totals] = await Promise.all([
          deps.db
            .select()
            .from(tenants)
            .where(where)
            .orderBy(desc(tenants.createdAt))
            .limit(pagination.pageSize)
            .offset((pagination.page - 1) * pagination.pageSize),
          deps.db.select({ value: count() }).from(tenants).where(where)
        ]);

        return page(rows.map(toTenantDto), totals[0]?.value ?? 0, pagination);
      },
      {
        requireAuth: true,
        requirePermission: 'tenants.manage',
        query: listTenantsQuerySchema,
        detail: { summary: 'List all tenants (platform administration)' }
      }
    )
    .get(
      '/current',
      async ({ ctx }) => {
        const tenantId = requireTenantId(ctx);
        const rows = await deps.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        const row = rows[0];
        if (!row) throw new Error('Tenant not found for authenticated context');
        return toTenantDto(row);
      },
      {
        requireTenant: true,
        response: { 200: tenantSchema },
        detail: { summary: 'The current tenant and its settings' }
      }
    )
    .patch(
      '/current',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const existing = await deps.db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        const current = existing[0];
        if (!current) throw new Error('Tenant not found');

        const settings = body.settings
          ? tenantSettingsSchema.parse({
              ...(current.settings ?? DEFAULT_TENANT_SETTINGS),
              ...body.settings
            })
          : current.settings;

        const updated = await deps.db
          .update(tenants)
          .set({
            ...(body.name ? { name: body.name } : {}),
            ...(body.legalName !== undefined ? { legalName: body.legalName ?? null } : {}),
            ...(body.settings ? { settings } : {}),
            updatedAt: new Date()
          })
          .where(eq(tenants.id, tenantId))
          .returning();

        await recordAudit(deps.db, ctx, {
          action: 'tenant.updated',
          entity: 'tenant',
          entityId: tenantId,
          oldValues: { name: current.name, settings: current.settings },
          newValues: { name: body.name ?? current.name, settings }
        });

        const row = updated[0];
        if (!row) throw new Error('Failed to update tenant');
        return toTenantDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'settings.manage',
        body: updateTenantSchema,
        response: { 200: tenantSchema },
        detail: { summary: 'Update the current tenant settings' }
      }
    )
    .post(
      '/',
      async ({ ctx, body }) => {
        const inserted = await deps.db
          .insert(tenants)
          .values({
            name: body.name,
            slug: body.slug,
            legalName: body.legalName ?? null,
            settings: { ...DEFAULT_TENANT_SETTINGS, ...(body.settings ?? {}) }
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error('Failed to create tenant');
        await recordAudit(deps.db, ctx, {
          action: 'tenant.created',
          entity: 'tenant',
          entityId: row.id
        });
        return toTenantDto(row);
      },
      {
        requirePermission: 'tenants.manage',
        body: createTenantSchema,
        response: { 200: tenantSchema },
        detail: { summary: 'Create a tenant (platform administration)' }
      }
    )
    .get(
      '/:id',
      async ({ params }) => {
        const rows = await deps.db.select().from(tenants).where(eq(tenants.id, params.id)).limit(1);
        const row = rows[0];
        if (!row) throw new Error('Tenant not found');
        return toTenantDto(row);
      },
      {
        requirePermission: 'tenants.manage',
        response: { 200: tenantSchema },
        detail: { summary: 'Get a tenant by id (platform administration)' }
      }
    );
