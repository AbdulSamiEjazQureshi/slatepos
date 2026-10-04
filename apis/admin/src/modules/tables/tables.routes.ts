import { Elysia } from 'elysia';
import { z } from 'zod';
import { and, asc, eq } from '@roms/database';
import { floors, reservations, restaurantTables } from '@roms/database';
import { tableStatusSchema } from '@roms/contracts/enums';
import { RealtimeTopic } from '@roms/contracts/events';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import { resolveBranch } from '../orders/orders.service';

const createFloorSchema = z.object({
  branchId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).default(0)
});

const createTableSchema = z.object({
  branchId: z.string().uuid().optional(),
  floorId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(50).default(2),
  positionX: z.number().int().min(0).default(0),
  positionY: z.number().int().min(0).default(0)
});

const updateTableSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  floorId: z.string().uuid().nullable().optional(),
  positionX: z.number().int().min(0).optional(),
  positionY: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

const tableStatusUpdateSchema = z.object({
  status: tableStatusSchema,
  orderId: z.string().uuid().nullable().optional()
});

const createReservationSchema = z.object({
  branchId: z.string().uuid().optional(),
  tableId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  partySize: z.number().int().min(1).max(50).default(2),
  reservedFrom: z.string().datetime({ offset: true }),
  reservedTo: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(300).optional()
});

const listQuery = z.object({ branchId: z.string().uuid().optional() });

export const tablesModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/tables', tags: ['tables'] })
    .use(authPlugin(deps))
    .get(
      '/floors',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const clauses = [
          eq(floors.tenantId, tenantId),
          query.branchId ? eq(floors.branchId, query.branchId) : undefined
        ].filter((clause) => clause !== undefined);
        return deps.db
          .select()
          .from(floors)
          .where(and(...clauses))
          .orderBy(asc(floors.sortOrder));
      },
      {
        requireTenant: true,
        requirePermission: 'tables.read',
        query: listQuery,
        detail: { summary: 'List floors' }
      }
    )
    .post(
      '/floors',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const branchId = await resolveBranch(deps, ctx, body.branchId);
        const inserted = await deps.db
          .insert(floors)
          .values({ tenantId, branchId, name: body.name, sortOrder: body.sortOrder })
          .returning();
        return inserted[0];
      },
      { requireTenant: true, requirePermission: 'tables.manage', body: createFloorSchema }
    )
    .get(
      '/',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const clauses = [
          eq(restaurantTables.tenantId, tenantId),
          query.branchId ? eq(restaurantTables.branchId, query.branchId) : undefined
        ].filter((clause) => clause !== undefined);
        return deps.db
          .select()
          .from(restaurantTables)
          .where(and(...clauses))
          .orderBy(asc(restaurantTables.name));
      },
      {
        requireTenant: true,
        requirePermission: 'tables.read',
        query: listQuery,
        detail: { summary: 'List tables and their live status' }
      }
    )
    .post(
      '/',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const branchId = await resolveBranch(deps, ctx, body.branchId);
        const inserted = await deps.db
          .insert(restaurantTables)
          .values({
            tenantId,
            branchId,
            floorId: body.floorId ?? null,
            name: body.name,
            capacity: body.capacity,
            positionX: body.positionX,
            positionY: body.positionY
          })
          .returning();
        return inserted[0];
      },
      { requireTenant: true, requirePermission: 'tables.manage', body: createTableSchema }
    )
    .patch(
      '/:id',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const updated = await deps.db
          .update(restaurantTables)
          .set({
            ...(body.name ? { name: body.name } : {}),
            ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
            ...(body.floorId !== undefined ? { floorId: body.floorId ?? null } : {}),
            ...(body.positionX !== undefined ? { positionX: body.positionX } : {}),
            ...(body.positionY !== undefined ? { positionY: body.positionY } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
            updatedAt: new Date()
          })
          .where(and(eq(restaurantTables.id, params.id), eq(restaurantTables.tenantId, tenantId)))
          .returning();
        const row = updated[0];
        if (!row) throw AppError.notFound('Table not found');
        return row;
      },
      { requireTenant: true, requirePermission: 'tables.manage', body: updateTableSchema }
    )
    .post(
      '/:id/status',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const updated = await deps.db
          .update(restaurantTables)
          .set({ status: body.status, updatedAt: new Date() })
          .where(and(eq(restaurantTables.id, params.id), eq(restaurantTables.tenantId, tenantId)))
          .returning();
        const row = updated[0];
        if (!row) throw AppError.notFound('Table not found');
        deps.realtime.publish(RealtimeTopic.branchTables(row.branchId), {
          type: 'table.status_changed',
          tableId: row.id,
          branchId: row.branchId,
          status: row.status,
          orderId: body.orderId ?? null
        });
        return row;
      },
      { requireTenant: true, requirePermission: 'tables.manage', body: tableStatusUpdateSchema }
    )
    .get(
      '/reservations',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const clauses = [
          eq(reservations.tenantId, tenantId),
          query.branchId ? eq(reservations.branchId, query.branchId) : undefined
        ].filter((clause) => clause !== undefined);
        return deps.db
          .select()
          .from(reservations)
          .where(and(...clauses))
          .orderBy(asc(reservations.reservedFrom));
      },
      {
        requireTenant: true,
        requirePermission: 'tables.read',
        query: listQuery,
        detail: { summary: 'List reservations' }
      }
    )
    .post(
      '/reservations',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const branchId = await resolveBranch(deps, ctx, body.branchId);
        const inserted = await deps.db
          .insert(reservations)
          .values({
            tenantId,
            branchId,
            tableId: body.tableId ?? null,
            customerId: body.customerId ?? null,
            partySize: body.partySize,
            reservedFrom: new Date(body.reservedFrom),
            reservedTo: body.reservedTo ? new Date(body.reservedTo) : null,
            notes: body.notes ?? null
          })
          .returning();
        return inserted[0];
      },
      {
        requireTenant: true,
        requirePermission: 'tables.manage',
        body: createReservationSchema,
        detail: { summary: 'Create a reservation' }
      }
    );
