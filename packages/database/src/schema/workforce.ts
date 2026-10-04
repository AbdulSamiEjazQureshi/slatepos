import {
  date,
  index,
  integer,
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { money, primaryId, rate, timestamps } from './columns';
import { branches, tenants } from './tenant';
import { users } from './auth';

export const employeeStatusEnum = pgEnum('employee_status', ['ACTIVE', 'INACTIVE', 'TERMINATED']);
export const salaryTypeEnum = pgEnum('salary_type', ['MONTHLY', 'DAILY', 'HOURLY']);
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'PRESENT',
  'ABSENT',
  'LATE',
  'LEAVE',
  'HOLIDAY'
]);
export const attendanceSourceEnum = pgEnum('attendance_source', ['MANUAL', 'BIOMETRIC']);
export const leaveStatusEnum = pgEnum('leave_status', [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
]);
export const advanceStatusEnum = pgEnum('advance_status', ['ISSUED', 'SETTLED']);
export const employeeLedgerTypeEnum = pgEnum('employee_ledger_type', [
  'SALARY',
  'ADVANCE',
  'COMMISSION',
  'DEDUCTION',
  'PAYMENT'
]);

export const departments = pgTable(
  'departments',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    ...timestamps
  },
  (table) => [uniqueIndex('departments_tenant_name_unique').on(table.tenantId, table.name)]
);

export const employees = pgTable(
  'employees',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    fullName: varchar('full_name', { length: 160 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    position: varchar('position', { length: 80 }),
    hireDate: date('hire_date'),
    status: employeeStatusEnum('status').notNull().default('ACTIVE'),
    salaryType: salaryTypeEnum('salary_type').notNull().default('MONTHLY'),
    salaryAmount: money('salary_amount').notNull().default('0'),
    commissionRate: rate('commission_rate').notNull().default('0'),
    ...timestamps
  },
  (table) => [
    index('employees_tenant_idx').on(table.tenantId),
    index('employees_branch_idx').on(table.branchId)
  ]
);

export const attendance = pgTable(
  'attendance',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    checkIn: timestamp('check_in', { withTimezone: true }),
    checkOut: timestamp('check_out', { withTimezone: true }),
    status: attendanceStatusEnum('status').notNull().default('PRESENT'),
    source: attendanceSourceEnum('source').notNull().default('MANUAL'),
    minutesWorked: integer('minutes_worked').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamps.createdAt
  },
  (table) => [
    uniqueIndex('attendance_employee_date_unique').on(table.employeeId, table.workDate),
    index('attendance_branch_date_idx').on(table.branchId, table.workDate)
  ]
);

export const shifts = pgTable(
  'shifts',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    role: varchar('role', { length: 60 }),
    ...timestamps
  },
  (table) => [index('shifts_employee_start_idx').on(table.employeeId, table.startAt)]
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    type: varchar('type', { length: 40 }).notNull().default('ANNUAL'),
    status: leaveStatusEnum('status').notNull().default('REQUESTED'),
    reason: text('reason'),
    ...timestamps
  },
  (table) => [index('leave_requests_employee_idx').on(table.employeeId, table.status)]
);

export const employeeAdvances = pgTable(
  'employee_advances',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    reason: varchar('reason', { length: 200 }),
    status: advanceStatusEnum('status').notNull().default('ISSUED'),
    ...timestamps
  },
  (table) => [index('employee_advances_employee_idx').on(table.employeeId)]
);

/** Append-only employee ledger (salary, advances, commissions, settlements). */
export const employeeLedgerEntries = pgTable(
  'employee_ledger_entries',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    entryType: employeeLedgerTypeEnum('entry_type').notNull(),
    debit: money('debit').notNull().default('0'),
    credit: money('credit').notNull().default('0'),
    balanceAfter: money('balance_after').notNull().default('0'),
    reference: varchar('reference', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('employee_ledger_employee_idx').on(table.employeeId, table.createdAt)]
);

export type EmployeeRow = typeof employees.$inferSelect;
export type AttendanceRow = typeof attendance.$inferSelect;
