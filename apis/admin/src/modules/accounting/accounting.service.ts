import { and, asc, count, desc, eq, gte, inArray, lte, sql } from '@roms/database';
import {
  accounts,
  cashMovements,
  cashDrawerSessions,
  customerLedgerEntries,
  dailyClosings,
  expenses,
  journalEntries,
  journalLines,
  orders,
  payments,
  tenants,
  type Db
} from '@roms/database';
import { DEFAULT_TENANT_SETTINGS } from '@roms/contracts/settings';
import {
  AppError,
  addSeconds,
  normalizePagination,
  startOfBusinessDay,
  toBusinessDate
} from '@roms/utils';
import { add, fromUnits, subtract, toUnits } from '@roms/utils/money';
import type { AppDeps } from '../../app/deps';
import type { RequestContext } from '../../lib/context';

const CHART: {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
}[] = [
  { code: '1000', name: 'Cash', type: 'ASSET' },
  { code: '1010', name: 'Bank', type: 'ASSET' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '2100', name: 'Tax Payable', type: 'LIABILITY' },
  { code: '3000', name: 'Owner Equity', type: 'EQUITY' },
  { code: '4000', name: 'Sales', type: 'INCOME' },
  { code: '4100', name: 'Delivery Income', type: 'INCOME' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
  { code: '5100', name: 'Operating Expenses', type: 'EXPENSE' },
  { code: '5200', name: 'Wastage', type: 'EXPENSE' }
];

/** Idempotently install the default chart of accounts for a tenant. */
export const ensureChartOfAccounts = async (tx: Db, tenantId: string): Promise<void> => {
  const existing = await tx
    .select({ code: accounts.code })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId));
  const have = new Set(existing.map((row) => row.code));
  const missing = CHART.filter((account) => !have.has(account.code));
  if (missing.length > 0) {
    await tx.insert(accounts).values(missing.map((account) => ({ tenantId, ...account })));
  }
};

export const listAccounts = async (deps: AppDeps, tenantId: string) => {
  await ensureChartOfAccounts(deps.db, tenantId);
  return deps.db
    .select()
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId))
    .orderBy(asc(accounts.code));
};

const accountIdByCode = async (tx: Db, tenantId: string, code: string): Promise<string> => {
  const rows = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)))
    .limit(1);
  const row = rows[0];
  if (!row) throw AppError.unprocessable('unprocessable', `Missing account ${code}`);
  return row.id;
};

export const postJournalEntry = async (
  tx: Db,
  input: {
    tenantId: string;
    branchId?: string | null;
    entryDate: string;
    memo: string;
    reference?: string | null;
    createdBy?: string | null;
    lines: { code: string; debit?: string; credit?: string }[];
  }
): Promise<string> => {
  const inserted = await tx
    .insert(journalEntries)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      entryDate: input.entryDate,
      memo: input.memo,
      reference: input.reference ?? null,
      createdBy: input.createdBy ?? null
    })
    .returning({ id: journalEntries.id });
  const entry = inserted[0];
  if (!entry) throw new Error('Failed to create journal entry');
  for (const line of input.lines) {
    await tx.insert(journalLines).values({
      entryId: entry.id,
      accountId: await accountIdByCode(tx, input.tenantId, line.code),
      debit: line.debit ?? '0',
      credit: line.credit ?? '0'
    });
  }
  return entry.id;
};

export const createExpense = async (
  deps: AppDeps,
  ctx: RequestContext,
  input: {
    category: string;
    amount: string;
    expenseDate: string;
    note?: string;
    paidFrom?: 'CASH' | 'BANK';
    branchId?: string;
  }
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  return deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await ensureChartOfAccounts(tx, tenantId);
    const inserted = await tx
      .insert(expenses)
      .values({
        tenantId,
        branchId: input.branchId ?? ctx.branchId,
        category: input.category,
        amount: input.amount,
        expenseDate: input.expenseDate,
        note: input.note ?? null,
        paidFrom: input.paidFrom ?? 'CASH',
        createdBy: ctx.userId
      })
      .returning({ id: expenses.id });
    await postJournalEntry(tx, {
      tenantId,
      branchId: input.branchId ?? ctx.branchId,
      entryDate: input.expenseDate,
      memo: `Expense: ${input.category}`,
      reference: inserted[0]?.id ?? null,
      createdBy: ctx.userId,
      lines: [
        { code: '5100', debit: input.amount },
        { code: input.paidFrom === 'BANK' ? '1010' : '1000', credit: input.amount }
      ]
    });
    const rows = await tx
      .select()
      .from(expenses)
      .where(eq(expenses.id, inserted[0]?.id ?? ''))
      .limit(1);
    return rows[0];
  });
};

export const listExpenses = async (
  deps: AppDeps,
  tenantId: string,
  query: { page?: number; pageSize?: number; from?: string; to?: string; category?: string }
) => {
  const pagination = normalizePagination(query);
  const clauses = [
    eq(expenses.tenantId, tenantId),
    query.from ? gte(expenses.expenseDate, query.from) : undefined,
    query.to ? lte(expenses.expenseDate, query.to) : undefined,
    query.category ? eq(expenses.category, query.category) : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);
  const [items, totals] = await Promise.all([
    deps.db
      .select()
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.expenseDate))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(expenses).where(where)
  ]);
  const total = totals[0]?.value ?? 0;
  const totalPages = Math.ceil(total / pagination.pageSize);
  return {
    items,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrevious: pagination.page > 1
    }
  };
};

export const openCashSession = async (
  deps: AppDeps,
  ctx: RequestContext,
  branchId: string,
  openingFloat: string
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  const open = await deps.db
    .select({ id: cashDrawerSessions.id })
    .from(cashDrawerSessions)
    .where(and(eq(cashDrawerSessions.branchId, branchId), eq(cashDrawerSessions.status, 'OPEN')))
    .limit(1);
  if (open[0]) throw AppError.conflict('A cash session is already open for this branch');
  const inserted = await deps.db
    .insert(cashDrawerSessions)
    .values({ tenantId, branchId, openedBy: ctx.userId, openingFloat })
    .returning();
  return inserted[0];
};

export const closeCashSession = async (
  deps: AppDeps,
  ctx: RequestContext,
  sessionId: string,
  countedCash: string
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const rows = await deps.db
    .select()
    .from(cashDrawerSessions)
    .where(and(eq(cashDrawerSessions.id, sessionId), eq(cashDrawerSessions.tenantId, tenantId)))
    .limit(1);
  const session = rows[0];
  if (!session) throw AppError.notFound('Cash session not found');
  if (session.status === 'CLOSED') throw AppError.conflict('Cash session already closed');

  const movementRows = await deps.db
    .select({ direction: cashMovements.direction, amount: cashMovements.amount })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.branchId, session.branchId),
        gte(cashMovements.createdAt, session.openedAt),
        lte(cashMovements.createdAt, new Date())
      )
    );

  const net = movementRows.reduce(
    (sum, row) => add(sum, row.direction === 'IN' ? toUnits(row.amount) : -toUnits(row.amount)),
    0n
  );
  const expected = add(toUnits(session.openingFloat), net);
  const difference = subtract(toUnits(countedCash), expected);

  const updated = await deps.db
    .update(cashDrawerSessions)
    .set({
      status: 'CLOSED',
      closedBy: ctx.userId,
      closedAt: new Date(),
      countedCash,
      expectedCash: fromUnits(expected),
      difference: fromUnits(difference),
      updatedAt: new Date()
    })
    .where(eq(cashDrawerSessions.id, sessionId))
    .returning();
  return updated[0];
};

export const computeDailyClosing = async (
  deps: AppDeps,
  ctx: RequestContext,
  branchId: string,
  businessDate: string
) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) throw AppError.unprocessable('tenant_required', 'A tenant context is required');

  const tenantRows = await deps.db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const timezone = tenantRows[0]?.settings?.timezone ?? DEFAULT_TENANT_SETTINGS.timezone;

  const start = startOfBusinessDay(new Date(`${businessDate}T12:00:00Z`), timezone);
  const end = addSeconds(start, 86_400);

  const orderRows = await deps.db
    .select({
      count: count(),
      gross: sql<string>`coalesce(sum(${orders.subtotal}), 0)`,
      discounts: sql<string>`coalesce(sum(${orders.discountTotal}), 0)`,
      tax: sql<string>`coalesce(sum(${orders.taxTotal}), 0)`,
      net: sql<string>`coalesce(sum(${orders.grandTotal}), 0)`
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.branchId, branchId),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
        sql`${orders.status} not in ('CANCELLED','FAILED')`
      )
    );

  const paymentRows = await deps.db
    .select({ method: payments.method, amount: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.branchId, branchId),
        eq(payments.status, 'CAPTURED'),
        gte(payments.createdAt, start),
        lte(payments.createdAt, end)
      )
    )
    .groupBy(payments.method);

  const totals = orderRows[0];
  const paymentsByMethod: Record<string, string> = {};
  for (const row of paymentRows) paymentsByMethod[row.method] = row.amount;

  const inserted = await deps.db
    .insert(dailyClosings)
    .values({
      tenantId,
      branchId,
      businessDate,
      grossSales: totals?.gross ?? '0',
      discounts: totals?.discounts ?? '0',
      taxTotal: totals?.tax ?? '0',
      netSales: totals?.net ?? '0',
      orderCount: String(totals?.count ?? 0),
      paymentsByMethod,
      closedBy: ctx.userId
    })
    .onConflictDoUpdate({
      target: [dailyClosings.branchId, dailyClosings.businessDate],
      set: {
        grossSales: totals?.gross ?? '0',
        discounts: totals?.discounts ?? '0',
        taxTotal: totals?.tax ?? '0',
        netSales: totals?.net ?? '0',
        orderCount: String(totals?.count ?? 0),
        paymentsByMethod,
        closedBy: ctx.userId
      }
    })
    .returning();

  // Sales journal: debit cash, credit sales + tax payable.
  await ensureChartOfAccounts(deps.db, tenantId);
  await postJournalEntry(deps.db, {
    tenantId,
    branchId,
    entryDate: businessDate,
    memo: `Daily closing ${businessDate}`,
    reference: inserted[0]?.id ?? null,
    createdBy: ctx.userId,
    lines: [
      { code: '1000', debit: totals?.net ?? '0' },
      { code: '4000', credit: totals?.gross ?? '0' },
      { code: '2100', credit: totals?.tax ?? '0' }
    ]
  });

  return inserted[0];
};

export const listDailyClosings = async (deps: AppDeps, tenantId: string, branchId?: string) => {
  const clauses = [
    eq(dailyClosings.tenantId, tenantId),
    branchId ? eq(dailyClosings.branchId, branchId) : undefined
  ].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(dailyClosings)
    .where(and(...clauses))
    .orderBy(desc(dailyClosings.businessDate))
    .limit(60);
};

export const profitAndLoss = async (deps: AppDeps, tenantId: string, from: string, to: string) => {
  const rows = await deps.db
    .select({
      type: accounts.type,
      amount: sql<string>`coalesce(sum(${journalLines.debit}), 0) - coalesce(sum(${journalLines.credit}), 0)`
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(
      and(
        eq(journalEntries.tenantId, tenantId),
        gte(journalEntries.entryDate, from),
        lte(journalEntries.entryDate, to),
        inArray(accounts.type, ['INCOME', 'EXPENSE'])
      )
    )
    .groupBy(accounts.type);

  const income = rows.find((row) => row.type === 'INCOME')?.amount ?? '0';
  const expense = rows.find((row) => row.type === 'EXPENSE')?.amount ?? '0';
  // Income accounts carry credit balances, so debit-credit is negative.
  const incomeValue = -toUnits(income);
  const expenseValue = toUnits(expense);
  return {
    income: fromUnits(incomeValue),
    expense: fromUnits(expenseValue),
    netProfit: fromUnits(subtract(incomeValue, expenseValue))
  };
};

export const listJournalEntries = async (deps: AppDeps, tenantId: string, limit = 100) => {
  const entries = await deps.db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.tenantId, tenantId))
    .orderBy(desc(journalEntries.entryDate))
    .limit(Math.min(limit, 200));
  if (entries.length === 0) return [];
  const lines = await deps.db
    .select()
    .from(journalLines)
    .where(
      inArray(
        journalLines.entryId,
        entries.map((entry) => entry.id)
      )
    );
  return entries.map((entry) => ({
    ...entry,
    lines: lines.filter((line) => line.entryId === entry.id)
  }));
};

export const businessDateFor = (date: Date, timezone: string): string =>
  toBusinessDate(date, timezone);

/** Append a customer ledger entry (receivable / wallet). */
export const recordCustomerLedger = async (
  tx: Db,
  input: {
    tenantId: string;
    customerId: string;
    entryType: 'SALE' | 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
    debit?: string;
    credit?: string;
    reference?: string | null;
  }
): Promise<void> => {
  const rows = await tx
    .select({ balanceAfter: customerLedgerEntries.balanceAfter })
    .from(customerLedgerEntries)
    .where(
      and(
        eq(customerLedgerEntries.tenantId, input.tenantId),
        eq(customerLedgerEntries.customerId, input.customerId)
      )
    )
    .orderBy(desc(customerLedgerEntries.createdAt))
    .limit(1);
  const previous = rows[0] ? toUnits(rows[0].balanceAfter) : 0n;
  const debit = toUnits(input.debit ?? '0');
  const credit = toUnits(input.credit ?? '0');
  await tx.insert(customerLedgerEntries).values({
    tenantId: input.tenantId,
    customerId: input.customerId,
    entryType: input.entryType,
    debit: fromUnits(debit),
    credit: fromUnits(credit),
    balanceAfter: fromUnits(add(previous, subtract(debit, credit))),
    reference: input.reference ?? null
  });
};

export const listCustomerLedger = async (deps: AppDeps, tenantId: string, customerId: string) => {
  const entries = await deps.db
    .select()
    .from(customerLedgerEntries)
    .where(
      and(
        eq(customerLedgerEntries.tenantId, tenantId),
        eq(customerLedgerEntries.customerId, customerId)
      )
    )
    .orderBy(desc(customerLedgerEntries.createdAt))
    .limit(200);
  return { entries, balance: entries[0]?.balanceAfter ?? '0' };
};
