import { Elysia } from 'elysia';
import { z } from 'zod';
import { moneySchema, uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import {
  computeDailyClosing,
  createExpense,
  closeCashSession,
  ensureChartOfAccounts,
  listAccounts,
  listCustomerLedger,
  listDailyClosings,
  listExpenses,
  listJournalEntries,
  openCashSession,
  profitAndLoss
} from './accounting.service';

export const accountingModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/accounting', tags: ['accounting'] })
    .use(authPlugin(deps))
    .get('/accounts', async ({ ctx }) => listAccounts(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'accounting.read'
    })
    .post(
      '/accounts/seed',
      async ({ ctx }) => {
        await ensureChartOfAccounts(deps.db, requireTenantId(ctx));
        return { ok: true as const };
      },
      { requireTenant: true, requirePermission: 'accounting.manage' }
    )
    .get('/expenses', async ({ ctx, query }) => listExpenses(deps, requireTenantId(ctx), query), {
      requireTenant: true,
      requirePermission: 'accounting.read',
      query: z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        category: z.string().optional()
      })
    })
    .post(
      '/expenses',
      async ({ ctx, body }) => {
        const expense = await createExpense(deps, ctx, body);
        await recordAudit(deps.db, ctx, {
          action: 'expense.created',
          entity: 'expense',
          entityId: expense?.id,
          newValues: { amount: body.amount, category: body.category }
        });
        return expense;
      },
      {
        requireTenant: true,
        requirePermission: 'accounting.manage',
        body: z.object({
          category: z.string().trim().min(1).max(80),
          amount: moneySchema,
          expenseDate: z.string(),
          note: z.string().max(1000).optional(),
          paidFrom: z.enum(['CASH', 'BANK']).default('CASH'),
          branchId: uuidSchema.optional()
        })
      }
    )
    .get('/journal', async ({ ctx }) => listJournalEntries(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'accounting.read'
    })
    .post(
      '/cash-sessions',
      async ({ ctx, body }) => openCashSession(deps, ctx, body.branchId, body.openingFloat),
      {
        requireTenant: true,
        requirePermission: 'accounting.manage',
        body: z.object({ branchId: uuidSchema, openingFloat: moneySchema.default('0') })
      }
    )
    .post(
      '/cash-sessions/:id/close',
      async ({ ctx, params, body }) => closeCashSession(deps, ctx, params.id, body.countedCash),
      {
        requireTenant: true,
        requirePermission: 'accounting.manage',
        body: z.object({ countedCash: moneySchema })
      }
    )
    .post(
      '/daily-closing',
      async ({ ctx, body }) => {
        const closing = await computeDailyClosing(deps, ctx, body.branchId, body.businessDate);
        await recordAudit(deps.db, ctx, {
          action: 'daily_closing.computed',
          entity: 'daily_closing',
          entityId: closing?.id,
          newValues: { businessDate: body.businessDate, net: closing?.netSales }
        });
        return closing;
      },
      {
        requireTenant: true,
        requirePermission: 'accounting.manage',
        body: z.object({ branchId: uuidSchema, businessDate: z.string() })
      }
    )
    .get(
      '/daily-closings',
      async ({ ctx, query }) => listDailyClosings(deps, requireTenantId(ctx), query.branchId),
      {
        requireTenant: true,
        requirePermission: 'accounting.read',
        query: z.object({ branchId: uuidSchema.optional() })
      }
    )
    .get(
      '/profit-loss',
      async ({ ctx, query }) => profitAndLoss(deps, requireTenantId(ctx), query.from, query.to),
      {
        requireTenant: true,
        requirePermission: 'accounting.read',
        query: z.object({ from: z.string(), to: z.string() })
      }
    )
    .get(
      '/customers/:id/ledger',
      async ({ ctx, params }) => listCustomerLedger(deps, requireTenantId(ctx), params.id),
      { requireTenant: true, requirePermission: 'accounting.read' }
    );
