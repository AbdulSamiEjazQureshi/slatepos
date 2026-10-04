import { Elysia } from 'elysia';
import { z } from 'zod';
import { and, eq, inArray, isNull } from '@roms/database';
import { orders, restaurantTables, tableMerges } from '@roms/database';
import { RealtimeTopic } from '@roms/contracts/events';
import type { OrderStatus, TableStatus } from '@roms/contracts/enums';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'PREPARING', 'READY'];

const loadTable = async (deps: AppDeps, tenantId: string, id: string) => {
  const rows = await deps.db
    .select()
    .from(restaurantTables)
    .where(and(eq(restaurantTables.id, id), eq(restaurantTables.tenantId, tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw AppError.notFound('Table not found');
  return row;
};

/** Floor operations: transfer, merge and split dine-in tables. */
export const tableOpsModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/tables', tags: ['tables'] })
    .use(authPlugin(deps))
    .post(
      '/transfer',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const from = await loadTable(deps, tenantId, body.fromTableId);
        const to = await loadTable(deps, tenantId, body.toTableId);

        await deps.db
          .update(orders)
          .set({ tableId: to.id, updatedAt: new Date() })
          .where(
            and(
              eq(orders.tenantId, tenantId),
              eq(orders.tableId, from.id),
              inArray(orders.status, ACTIVE_ORDER_STATUSES)
            )
          );
        await deps.db
          .update(restaurantTables)
          .set({ status: 'AVAILABLE', updatedAt: new Date() })
          .where(eq(restaurantTables.id, from.id));
        await deps.db
          .update(restaurantTables)
          .set({ status: 'OCCUPIED', updatedAt: new Date() })
          .where(eq(restaurantTables.id, to.id));

        for (const table of [from, to]) {
          deps.realtime.publish(RealtimeTopic.branchTables(table.branchId), {
            type: 'table.status_changed',
            tableId: table.id,
            branchId: table.branchId,
            status: (table.id === to.id ? 'OCCUPIED' : 'AVAILABLE') as TableStatus,
            orderId: null
          });
        }
        return { ok: true as const };
      },
      {
        requireTenant: true,
        requirePermission: 'tables.manage',
        body: z.object({ fromTableId: z.string().uuid(), toTableId: z.string().uuid() })
      }
    )
    .post(
      '/merge',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const primary = await loadTable(deps, tenantId, body.primaryTableId);

        for (const mergedId of body.mergedTableIds) {
          if (mergedId === primary.id) continue;
          await loadTable(deps, tenantId, mergedId);
          await deps.db
            .insert(tableMerges)
            .values({ tenantId, primaryTableId: primary.id, mergedTableId: mergedId });
          await deps.db
            .update(orders)
            .set({ tableId: primary.id, updatedAt: new Date() })
            .where(
              and(
                eq(orders.tenantId, tenantId),
                eq(orders.tableId, mergedId),
                inArray(orders.status, ACTIVE_ORDER_STATUSES)
              )
            );
          await deps.db
            .update(restaurantTables)
            .set({ status: 'OUT_OF_SERVICE', updatedAt: new Date() })
            .where(eq(restaurantTables.id, mergedId));
        }
        await deps.db
          .update(restaurantTables)
          .set({ status: 'OCCUPIED', updatedAt: new Date() })
          .where(eq(restaurantTables.id, primary.id));
        return { ok: true as const };
      },
      {
        requireTenant: true,
        requirePermission: 'tables.manage',
        body: z.object({
          primaryTableId: z.string().uuid(),
          mergedTableIds: z.array(z.string().uuid()).min(1)
        })
      }
    )
    .post(
      '/split',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const primary = await loadTable(deps, tenantId, body.primaryTableId);
        const merges = await deps.db
          .select()
          .from(tableMerges)
          .where(
            and(
              eq(tableMerges.tenantId, tenantId),
              eq(tableMerges.primaryTableId, primary.id),
              isNull(tableMerges.releasedAt)
            )
          );

        for (const merge of merges) {
          await deps.db
            .update(restaurantTables)
            .set({ status: 'AVAILABLE', updatedAt: new Date() })
            .where(eq(restaurantTables.id, merge.mergedTableId));
        }
        if (merges.length > 0) {
          await deps.db
            .update(tableMerges)
            .set({ releasedAt: new Date() })
            .where(
              and(
                eq(tableMerges.tenantId, tenantId),
                eq(tableMerges.primaryTableId, primary.id),
                isNull(tableMerges.releasedAt)
              )
            );
        }
        await deps.db
          .update(restaurantTables)
          .set({ status: 'AVAILABLE', updatedAt: new Date() })
          .where(eq(restaurantTables.id, primary.id));
        return { released: merges.length };
      },
      {
        requireTenant: true,
        requirePermission: 'tables.manage',
        body: z.object({ primaryTableId: z.string().uuid() })
      }
    );
