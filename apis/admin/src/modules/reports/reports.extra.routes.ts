import { Elysia } from 'elysia';
import { z } from 'zod';
import { and, count, desc, eq, gte, lte, sql } from '@roms/database';
import {
  customers,
  kitchenTickets,
  orders,
  products,
  purchaseOrders,
  stockLevels,
  suppliers,
  taxInvoices
} from '@roms/database';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';

const rangeQuery = z.object({ from: z.string().optional(), to: z.string().optional() });

/** Additional analytics, all aggregated in PostgreSQL. */
export const reportsExtraModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/reports', tags: ['reports'] })
    .use(authPlugin(deps))
    .get(
      '/inventory-valuation',
      async ({ ctx }) => {
        const tenantId = requireTenantId(ctx);
        const rows = await deps.db
          .select({
            productId: stockLevels.productId,
            name: products.name,
            quantity: stockLevels.quantity,
            cost: products.costPrice,
            value: sql<string>`coalesce(${stockLevels.quantity} * ${products.costPrice}, 0)`
          })
          .from(stockLevels)
          .innerJoin(products, eq(products.id, stockLevels.productId))
          .where(eq(stockLevels.tenantId, tenantId))
          .orderBy(desc(sql`coalesce(${stockLevels.quantity} * ${products.costPrice}, 0)`))
          .limit(200);
        const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
        return { items: rows, total: total.toFixed(4) };
      },
      { requireTenant: true, requirePermission: 'reports.read' }
    )
    .get(
      '/purchases',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const clauses = [
          eq(purchaseOrders.tenantId, tenantId),
          query.from ? gte(purchaseOrders.createdAt, new Date(query.from)) : undefined,
          query.to ? lte(purchaseOrders.createdAt, new Date(query.to)) : undefined
        ].filter((clause) => clause !== undefined);
        const bySupplier = await deps.db
          .select({
            supplierId: suppliers.id,
            supplierName: suppliers.name,
            orders: count(),
            total: sql<string>`coalesce(sum(${purchaseOrders.total}), 0)`
          })
          .from(purchaseOrders)
          .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
          .where(and(...clauses))
          .groupBy(suppliers.id, suppliers.name)
          .orderBy(desc(sql`coalesce(sum(${purchaseOrders.total}), 0)`));
        const byStatus = await deps.db
          .select({ status: purchaseOrders.status, count: count() })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.tenantId, tenantId))
          .groupBy(purchaseOrders.status);
        return { bySupplier, byStatus };
      },
      { requireTenant: true, requirePermission: 'reports.read', query: rangeQuery }
    )
    .get(
      '/taxes',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const clauses = [
          eq(orders.tenantId, tenantId),
          sql`${orders.status} not in ('CANCELLED','FAILED')`,
          query.from ? gte(orders.createdAt, new Date(query.from)) : undefined,
          query.to ? lte(orders.createdAt, new Date(query.to)) : undefined
        ].filter((clause) => clause !== undefined);
        const collected = await deps.db
          .select({
            taxableOrders: count(),
            taxCollected: sql<string>`coalesce(sum(${orders.taxTotal}), 0)`
          })
          .from(orders)
          .where(and(...clauses));
        const invoices = await deps.db
          .select({
            status: taxInvoices.status,
            count: count(),
            tax: sql<string>`coalesce(sum(${taxInvoices.taxTotal}), 0)`
          })
          .from(taxInvoices)
          .where(eq(taxInvoices.tenantId, tenantId))
          .groupBy(taxInvoices.status);
        return { collected: collected[0], invoices };
      },
      { requireTenant: true, requirePermission: 'reports.read', query: rangeQuery }
    )
    .get(
      '/customers',
      async ({ ctx }) => {
        const tenantId = requireTenantId(ctx);
        return deps.db
          .select({
            customerId: customers.id,
            name: customers.name,
            orders: count(orders.id),
            revenue: sql<string>`coalesce(sum(${orders.grandTotal}), 0)`
          })
          .from(customers)
          .leftJoin(orders, eq(orders.customerId, customers.id))
          .where(eq(customers.tenantId, tenantId))
          .groupBy(customers.id, customers.name)
          .orderBy(desc(sql`coalesce(sum(${orders.grandTotal}), 0)`))
          .limit(20);
      },
      { requireTenant: true, requirePermission: 'reports.read' }
    )
    .get(
      '/kitchen',
      async ({ ctx }) => {
        const tenantId = requireTenantId(ctx);
        const byStatus = await deps.db
          .select({ status: kitchenTickets.status, count: count() })
          .from(kitchenTickets)
          .where(eq(kitchenTickets.tenantId, tenantId))
          .groupBy(kitchenTickets.status);
        const timing = await deps.db
          .select({
            avgMinutes: sql<string>`coalesce(avg(extract(epoch from (coalesce(${kitchenTickets.readyAt}, now()) - ${kitchenTickets.createdAt})) / 60), 0)`
          })
          .from(kitchenTickets)
          .where(
            and(
              eq(kitchenTickets.tenantId, tenantId),
              sql`${kitchenTickets.status} in ('PREPARING','READY','SERVED')`
            )
          );
        return { byStatus, timing: timing[0] };
      },
      { requireTenant: true, requirePermission: 'reports.read' }
    );
