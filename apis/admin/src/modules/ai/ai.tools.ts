import { and, count, desc, eq, gte, lte, sql } from '@roms/database';
import {
  customers,
  orderItems,
  orders,
  products,
  purchaseOrders,
  stockLevels,
  suppliers
} from '@roms/database';
import { z } from 'zod';
import type { AppDeps } from '../../app/deps';

/**
 * Explicit, validated tools. The AI never receives SQL access — it may only
 * invoke these functions, which are themselves authorized application queries.
 */
export type AiTool = {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodTypeAny;
  readonly run: (deps: AppDeps, tenantId: string, args: unknown) => Promise<unknown>;
};

const dateRange = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

const rangeOf = (args: { from?: string; to?: string }): { from: Date; to: Date } => ({
  from: args.from
    ? new Date(args.from)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  to: args.to ? new Date(args.to) : new Date()
});

export const aiTools: AiTool[] = [
  {
    name: 'get_sales_summary',
    description: 'Sales totals (orders, gross, discounts, tax, net) for a date range.',
    parameters: dateRange,
    run: async (deps, tenantId, raw) => {
      const args = dateRange.parse(raw);
      const { from, to } = rangeOf(args);
      const rows = await deps.db
        .select({
          orderCount: count(),
          gross: sql<string>`coalesce(sum(${orders.subtotal}), 0)`,
          discounts: sql<string>`coalesce(sum(${orders.discountTotal}), 0)`,
          tax: sql<string>`coalesce(sum(${orders.taxTotal}), 0)`,
          net: sql<string>`coalesce(sum(${orders.grandTotal}), 0)`
        })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            gte(orders.createdAt, from),
            lte(orders.createdAt, to),
            sql`${orders.status} not in ('CANCELLED','FAILED')`
          )
        );
      return rows[0];
    }
  },
  {
    name: 'get_product_sales',
    description: 'Best selling products by quantity for a date range.',
    parameters: dateRange.extend({ limit: z.number().int().min(1).max(50).default(10) }),
    run: async (deps, tenantId, raw) => {
      const args = dateRange
        .extend({ limit: z.number().int().min(1).max(50).default(10) })
        .parse(raw);
      const { from, to } = rangeOf(args);
      return deps.db
        .select({
          name: orderItems.name,
          quantitySold: sql<number>`sum(${orderItems.quantity})`.mapWith(Number),
          revenue: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)`
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            eq(orderItems.tenantId, tenantId),
            gte(orders.createdAt, from),
            lte(orders.createdAt, to)
          )
        )
        .groupBy(orderItems.name)
        .orderBy(sql`sum(${orderItems.quantity}) desc`)
        .limit(args.limit);
    }
  },
  {
    name: 'get_low_stock_items',
    description: 'Products at or below their reorder point.',
    parameters: z.object({ branchId: z.string().uuid().optional() }),
    run: async (deps, tenantId, raw) => {
      const args = z.object({ branchId: z.string().uuid().optional() }).parse(raw);
      const clauses = [
        eq(stockLevels.tenantId, tenantId),
        sql`${stockLevels.quantity} <= ${stockLevels.reorderPoint}`,
        args.branchId ? eq(stockLevels.branchId, args.branchId) : undefined
      ].filter((clause) => clause !== undefined);
      return deps.db
        .select({
          productName: products.name,
          quantity: stockLevels.quantity,
          reorderPoint: stockLevels.reorderPoint
        })
        .from(stockLevels)
        .innerJoin(products, eq(products.id, stockLevels.productId))
        .where(and(...clauses))
        .limit(50);
    }
  },
  {
    name: 'get_customer_summary',
    description: 'Customer count and top customers by order count.',
    parameters: z.object({}),
    run: async (deps, tenantId) => {
      const totals = await deps.db
        .select({ value: count() })
        .from(customers)
        .where(eq(customers.tenantId, tenantId));
      const top = await deps.db
        .select({ name: customers.name, orders: count(orders.id) })
        .from(customers)
        .leftJoin(orders, eq(orders.customerId, customers.id))
        .where(eq(customers.tenantId, tenantId))
        .groupBy(customers.id, customers.name)
        .orderBy(desc(count(orders.id)))
        .limit(5);
      return { total: totals[0]?.value ?? 0, top };
    }
  },
  {
    name: 'get_purchase_summary',
    description: 'Purchase order totals grouped by status, plus active suppliers.',
    parameters: dateRange,
    run: async (deps, tenantId) => {
      const byStatus = await deps.db
        .select({
          status: purchaseOrders.status,
          count: count(),
          total: sql<string>`coalesce(sum(${purchaseOrders.total}), 0)`
        })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.tenantId, tenantId))
        .groupBy(purchaseOrders.status);
      const supplierCount = await deps.db
        .select({ value: count() })
        .from(suppliers)
        .where(eq(suppliers.tenantId, tenantId));
      return { byStatus, supplierCount: supplierCount[0]?.value ?? 0 };
    }
  },
  {
    name: 'get_daily_revenue',
    description: 'Revenue per business day for the last N days.',
    parameters: z.object({ days: z.number().int().min(1).max(90).default(7) }),
    run: async (deps, tenantId, raw) => {
      const args = z.object({ days: z.number().int().min(1).max(90).default(7) }).parse(raw);
      const from = new Date();
      from.setDate(from.getDate() - args.days);
      return deps.db
        .select({
          day: sql<string>`date_trunc('day', ${orders.createdAt})::date::text`,
          revenue: sql<string>`coalesce(sum(${orders.grandTotal}), 0)`,
          orders: count()
        })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            gte(orders.createdAt, from),
            sql`${orders.status} not in ('CANCELLED','FAILED')`
          )
        )
        .groupBy(sql`date_trunc('day', ${orders.createdAt})`)
        .orderBy(sql`date_trunc('day', ${orders.createdAt}) desc`);
    }
  }
];

export const findTool = (name: string): AiTool | null =>
  aiTools.find((tool) => tool.name === name) ?? null;

export const toolsManifest = () =>
  aiTools.map((tool) => ({ name: tool.name, description: tool.description }));
