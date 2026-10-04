import { Elysia } from 'elysia';
import { z } from 'zod';
import { and, count, eq, gte, lte, sql } from '@roms/database';
import { orders, orderItems, payments } from '@roms/database';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import { resolveBranch } from '../orders/orders.service';

const rangeQuery = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

const trendQuery = z
  .object({
    branchId: z.string().uuid().optional(),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    timezone: z
      .string()
      .max(100)
      .default('UTC')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Use a valid time zone')
  })
  .refine(({ from, to }) => {
    const duration = new Date(to).getTime() - new Date(from).getTime();
    return duration >= 0 && duration <= 31 * 86_400_000;
  }, 'Choose a date range of up to 31 days');

const dateClauses = (from?: string, to?: string) => [
  from ? gte(orders.createdAt, new Date(from)) : undefined,
  to ? lte(orders.createdAt, new Date(to)) : undefined
];

/**
 * Reports use server-side SQL aggregation — only the aggregate is transferred,
 * never the underlying rows.
 */
export const reportsModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/reports', tags: ['reports'] })
    .use(authPlugin(deps))
    .get(
      '/sales-summary',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const branchId = query.branchId
          ? await resolveBranch(deps, ctx, query.branchId)
          : ctx.branchId;

        const clauses = [
          eq(orders.tenantId, tenantId),
          branchId ? eq(orders.branchId, branchId) : undefined,
          sql`${orders.status} not in ('DRAFT', 'CANCELLED', 'FAILED')`,
          ...dateClauses(query.from, query.to)
        ].filter((clause) => clause !== undefined);

        const rows = await deps.db
          .select({
            orderCount: count(),
            grossSales: sql<string>`coalesce(sum(${orders.subtotal}), 0)`,
            discounts: sql<string>`coalesce(sum(${orders.discountTotal}), 0)`,
            tax: sql<string>`coalesce(sum(${orders.taxTotal}), 0)`,
            netSales: sql<string>`coalesce(sum(${orders.grandTotal}), 0)`,
            averageOrderValue: sql<string>`round(coalesce(avg(${orders.grandTotal}), 0), 4)`
          })
          .from(orders)
          .where(and(...clauses));

        return rows[0] ?? { orderCount: 0 };
      },
      {
        requireTenant: true,
        requirePermission: 'reports.read',
        query: rangeQuery,
        detail: { summary: 'Sales totals for a date range (server-side aggregation)' }
      }
    )
    .get(
      '/sales-series',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const branchId = query.branchId
          ? await resolveBranch(deps, ctx, query.branchId)
          : ctx.branchId;
        const day = sql<string>`to_char(${orders.createdAt} at time zone ${query.timezone}, 'YYYY-MM-DD')`;
        return deps.db
          .select({
            date: day,
            orderCount: count(),
            sales: sql<string>`coalesce(sum(${orders.grandTotal}), 0)`
          })
          .from(orders)
          .where(
            and(
              eq(orders.tenantId, tenantId),
              branchId ? eq(orders.branchId, branchId) : undefined,
              sql`${orders.status} not in ('DRAFT', 'CANCELLED', 'FAILED')`,
              ...dateClauses(query.from, query.to)
            )
          )
          .groupBy(sql`1`)
          .orderBy(sql`1`);
      },
      {
        requireTenant: true,
        requirePermission: 'reports.read',
        query: trendQuery,
        detail: { summary: 'Daily confirmed order sales, aggregated in the requested time zone' }
      }
    )
    .get(
      '/top-products',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const branchId = query.branchId
          ? await resolveBranch(deps, ctx, query.branchId)
          : ctx.branchId;
        const clauses = [
          eq(orderItems.tenantId, tenantId),
          sql`${orders.status} not in ('DRAFT', 'CANCELLED', 'FAILED')`,
          branchId ? eq(orderItems.branchId, branchId) : undefined,
          ...dateClauses(query.from, query.to)
        ].filter((clause) => clause !== undefined);

        return deps.db
          .select({
            productId: orderItems.productId,
            name: orderItems.name,
            quantitySold: sql<number>`sum(${orderItems.quantity})`.mapWith(Number),
            revenue: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)`
          })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(and(...clauses))
          .groupBy(orderItems.productId, orderItems.name)
          .orderBy(sql`sum(${orderItems.quantity}) desc`)
          .limit(20);
      },
      {
        requireTenant: true,
        requirePermission: 'reports.read',
        query: rangeQuery,
        detail: { summary: 'Best-selling products (GROUP BY in the database)' }
      }
    )
    .get(
      '/payment-methods',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        const branchId = query.branchId
          ? await resolveBranch(deps, ctx, query.branchId)
          : ctx.branchId;
        const clauses = [
          eq(payments.tenantId, tenantId),
          branchId ? eq(payments.branchId, branchId) : undefined,
          eq(payments.status, 'CAPTURED'),
          query.from ? gte(payments.createdAt, new Date(query.from)) : undefined,
          query.to ? lte(payments.createdAt, new Date(query.to)) : undefined
        ].filter((clause) => clause !== undefined);

        return deps.db
          .select({
            method: payments.method,
            count: count(),
            amount: sql<string>`coalesce(sum(${payments.amount}), 0)`
          })
          .from(payments)
          .where(and(...clauses))
          .groupBy(payments.method);
      },
      {
        requireTenant: true,
        requirePermission: 'reports.read',
        query: rangeQuery,
        detail: { summary: 'Captured payments grouped by method' }
      }
    );
