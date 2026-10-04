import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps } from './columns';
import { branches, tenants } from './tenant';
import { users } from './auth';
import { customers } from './customers';

export const accountTypeEnum = pgEnum('account_type', [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE'
]);
export const expensePaidFromEnum = pgEnum('expense_paid_from', ['CASH', 'BANK']);
export const cashSessionStatusEnum = pgEnum('cash_session_status', ['OPEN', 'CLOSED']);
export const customerLedgerTypeEnum = pgEnum('customer_ledger_type', [
  'SALE',
  'PAYMENT',
  'REFUND',
  'ADJUSTMENT'
]);

/** Minimal chart of accounts; restaurant-focused. */
export const accounts = pgTable(
  'accounts',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    type: accountTypeEnum('type').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  (table) => [uniqueIndex('accounts_tenant_code_unique').on(table.tenantId, table.code)]
);

/** Append-only double-entry journal. */
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    entryDate: date('entry_date').notNull(),
    memo: varchar('memo', { length: 300 }).notNull(),
    reference: varchar('reference', { length: 120 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('journal_entries_tenant_date_idx').on(table.tenantId, table.entryDate)]
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: primaryId(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    debit: money('debit').notNull().default('0'),
    credit: money('credit').notNull().default('0')
  },
  (table) => [
    index('journal_lines_entry_idx').on(table.entryId),
    index('journal_lines_account_idx').on(table.accountId)
  ]
);

export const expenses = pgTable(
  'expenses',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    category: varchar('category', { length: 80 }).notNull(),
    amount: money('amount').notNull(),
    expenseDate: date('expense_date').notNull(),
    note: text('note'),
    paidFrom: expensePaidFromEnum('paid_from').notNull().default('CASH'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('expenses_tenant_date_idx').on(table.tenantId, table.expenseDate)]
);

export const cashDrawerSessions = pgTable(
  'cash_drawer_sessions',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    openedBy: uuid('opened_by').references(() => users.id, { onDelete: 'set null' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    openingFloat: money('opening_float').notNull().default('0'),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    countedCash: money('counted_cash'),
    expectedCash: money('expected_cash'),
    difference: money('difference'),
    status: cashSessionStatusEnum('status').notNull().default('OPEN'),
    ...timestamps
  },
  (table) => [index('cash_sessions_branch_status_idx').on(table.branchId, table.status)]
);

export const dailyClosings = pgTable(
  'daily_closings',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    businessDate: date('business_date').notNull(),
    grossSales: money('gross_sales').notNull().default('0'),
    discounts: money('discounts').notNull().default('0'),
    taxTotal: money('tax_total').notNull().default('0'),
    netSales: money('net_sales').notNull().default('0'),
    orderCount: varchar('order_count', { length: 12 }).notNull().default('0'),
    paymentsByMethod: jsonb('payments_by_method').$type<Record<string, string>>(),
    cashVariance: money('cash_variance').notNull().default('0'),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('daily_closings_branch_date_unique').on(table.branchId, table.businessDate)
  ]
);

export const customerLedgerEntries = pgTable(
  'customer_ledger_entries',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    entryType: customerLedgerTypeEnum('entry_type').notNull(),
    debit: money('debit').notNull().default('0'),
    credit: money('credit').notNull().default('0'),
    balanceAfter: money('balance_after').notNull().default('0'),
    reference: varchar('reference', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('customer_ledger_customer_idx').on(table.customerId, table.createdAt)]
);

export type AccountRow = typeof accounts.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type DailyClosingRow = typeof dailyClosings.$inferSelect;
