import { Elysia } from 'elysia';
import { and, count, desc, eq, ilike, or } from '@roms/database';
import { customers, type CustomerRow } from '@roms/database';
import {
  createCustomerSchema,
  customerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
  type CustomerDto
} from '@roms/contracts/customers';
import { AppError, normalizePagination } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { page } from '../../lib/http';
import { authPlugin } from '../../plugins/auth';

const toCustomerDto = (row: CustomerRow): CustomerDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  phone: row.phone,
  email: row.email,
  notes: row.notes,
  group: row.group,
  loyaltyPoints: row.loyaltyPoints,
  walletBalance: row.walletBalance,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export const customersModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/customers', tags: ['customers'] })
    .use(authPlugin(deps))
    .get(
      '/',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const pagination = normalizePagination(query);
        const clauses = [
          eq(customers.tenantId, tenantId),
          query.group ? eq(customers.group, query.group) : undefined,
          query.q
            ? or(
                ilike(customers.name, `%${query.q}%`),
                ilike(customers.phone, `%${query.q}%`),
                ilike(customers.email, `%${query.q}%`)
              )
            : undefined
        ].filter((clause) => clause !== undefined);
        const where = and(...clauses);

        const [rows, totals] = await Promise.all([
          deps.db
            .select()
            .from(customers)
            .where(where)
            .orderBy(desc(customers.createdAt))
            .limit(pagination.pageSize)
            .offset((pagination.page - 1) * pagination.pageSize),
          deps.db.select({ value: count() }).from(customers).where(where)
        ]);
        return page(rows.map(toCustomerDto), totals[0]?.value ?? 0, pagination);
      },
      {
        requireTenant: true,
        requirePermission: 'customers.read',
        query: listCustomersQuerySchema,
        detail: { summary: 'List customers' }
      }
    )
    .post(
      '/',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const inserted = await deps.db
          .insert(customers)
          .values({
            tenantId,
            name: body.name,
            phone: body.phone ?? null,
            email: body.email ?? null,
            notes: body.notes ?? null,
            group: body.group ?? null
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error('Failed to create customer');
        return toCustomerDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'customers.manage',
        body: createCustomerSchema,
        response: { 200: customerSchema },
        detail: { summary: 'Create a customer' }
      }
    )
    .get(
      '/:id',
      async ({ ctx, params }) => {
        const rows = await deps.db
          .select()
          .from(customers)
          .where(and(eq(customers.id, params.id), eq(customers.tenantId, requireTenantId(ctx))))
          .limit(1);
        const row = rows[0];
        if (!row) throw AppError.notFound('Customer not found');
        return toCustomerDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'customers.read',
        response: { 200: customerSchema },
        detail: { summary: 'Get a customer by id' }
      }
    )
    .patch(
      '/:id',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const updated = await deps.db
          .update(customers)
          .set({
            ...(body.name ? { name: body.name } : {}),
            ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
            ...(body.email !== undefined ? { email: body.email ?? null } : {}),
            ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
            ...(body.group !== undefined ? { group: body.group ?? null } : {}),
            updatedAt: new Date()
          })
          .where(and(eq(customers.id, params.id), eq(customers.tenantId, tenantId)))
          .returning();
        const row = updated[0];
        if (!row) throw AppError.notFound('Customer not found');
        return toCustomerDto(row);
      },
      {
        requireTenant: true,
        requirePermission: 'customers.manage',
        body: updateCustomerSchema,
        response: { 200: customerSchema },
        detail: { summary: 'Update a customer' }
      }
    );
