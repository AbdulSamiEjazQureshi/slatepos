import { and, asc, count, desc, eq, gte, lte, sql } from '@roms/database';
import {
  attendance,
  departments,
  employeeAdvances,
  employeeLedgerEntries,
  employees,
  leaveRequests,
  shifts,
  type Db
} from '@roms/database';
import { AppError, normalizePagination } from '@roms/utils';
import { add, fromUnits, subtract, toUnits } from '@roms/utils/money';
import type { AppDeps } from '../../app/deps';

/** Biometric/face/device integrations plug in behind this adapter. */
export type AttendanceDevice = {
  readonly name: string;
  fetchPunches: (from: Date, to: Date) => Promise<{ employeeCode: string; at: Date }[]>;
};

export const createAttendanceDeviceRegistry = () => {
  const devices = new Map<string, AttendanceDevice>();
  return {
    register: (device: AttendanceDevice) => devices.set(device.name, device),
    get: (name: string): AttendanceDevice | null => devices.get(name) ?? null,
    list: () => [...devices.keys()]
  };
};

export const listDepartments = async (deps: AppDeps, tenantId: string) =>
  deps.db
    .select()
    .from(departments)
    .where(eq(departments.tenantId, tenantId))
    .orderBy(asc(departments.name));

export const createDepartment = async (deps: AppDeps, tenantId: string, name: string) => {
  const inserted = await deps.db.insert(departments).values({ tenantId, name }).returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create department');
  return row;
};

export type EmployeeInput = {
  fullName: string;
  branchId?: string | null;
  departmentId?: string | null;
  phone?: string;
  position?: string;
  hireDate?: string | null;
  salaryType?: 'MONTHLY' | 'DAILY' | 'HOURLY';
  salaryAmount?: string;
  commissionRate?: string;
};

export const listEmployees = async (
  deps: AppDeps,
  tenantId: string,
  query: { page?: number; pageSize?: number; q?: string; branchId?: string }
) => {
  const pagination = normalizePagination(query);
  const clauses = [
    eq(employees.tenantId, tenantId),
    query.branchId ? eq(employees.branchId, query.branchId) : undefined,
    query.q ? sql`${employees.fullName} ilike ${`%${query.q}%`}` : undefined
  ].filter((clause) => clause !== undefined);
  const where = and(...clauses);
  const [items, totals] = await Promise.all([
    deps.db
      .select()
      .from(employees)
      .where(where)
      .orderBy(asc(employees.fullName))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(employees).where(where)
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

export const createEmployee = async (deps: AppDeps, tenantId: string, input: EmployeeInput) => {
  const inserted = await deps.db
    .insert(employees)
    .values({
      tenantId,
      fullName: input.fullName,
      branchId: input.branchId ?? null,
      departmentId: input.departmentId ?? null,
      phone: input.phone ?? null,
      position: input.position ?? null,
      hireDate: input.hireDate ?? null,
      salaryType: input.salaryType ?? 'MONTHLY',
      salaryAmount: input.salaryAmount ?? '0',
      commissionRate: input.commissionRate ?? '0'
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create employee');
  return row;
};

export const updateEmployee = async (
  deps: AppDeps,
  tenantId: string,
  id: string,
  input: Partial<EmployeeInput> & { status?: 'ACTIVE' | 'INACTIVE' | 'TERMINATED' }
) => {
  const updated = await deps.db
    .update(employees)
    .set({
      ...(input.fullName ? { fullName: input.fullName } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId ?? null } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId ?? null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.position !== undefined ? { position: input.position ?? null } : {}),
      ...(input.hireDate !== undefined ? { hireDate: input.hireDate ?? null } : {}),
      ...(input.salaryType ? { salaryType: input.salaryType } : {}),
      ...(input.salaryAmount !== undefined ? { salaryAmount: input.salaryAmount } : {}),
      ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
      ...(input.status ? { status: input.status } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Employee not found');
  return row;
};

export const recordAttendance = async (
  deps: AppDeps,
  tenantId: string,
  input: {
    employeeId: string;
    workDate: string;
    status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY';
    source?: 'MANUAL' | 'BIOMETRIC';
    checkIn?: string | null;
    checkOut?: string | null;
    notes?: string;
  }
) => {
  const employee = await deps.db
    .select({ id: employees.id, branchId: employees.branchId })
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, tenantId)))
    .limit(1);
  if (employee.length === 0) throw AppError.notFound('Employee not found');

  const checkIn = input.checkIn ? new Date(input.checkIn) : null;
  const checkOut = input.checkOut ? new Date(input.checkOut) : null;
  const minutes =
    checkIn && checkOut
      ? Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000))
      : 0;

  const inserted = await deps.db
    .insert(attendance)
    .values({
      tenantId,
      branchId: employee[0]?.branchId ?? null,
      employeeId: input.employeeId,
      workDate: input.workDate,
      status: input.status ?? 'PRESENT',
      source: input.source ?? 'MANUAL',
      checkIn,
      checkOut,
      minutesWorked: minutes,
      notes: input.notes ?? null
    })
    .onConflictDoUpdate({
      target: [attendance.employeeId, attendance.workDate],
      set: {
        status: input.status ?? 'PRESENT',
        checkIn,
        checkOut,
        minutesWorked: minutes,
        notes: input.notes ?? null
      }
    })
    .returning();
  return inserted[0];
};

export const listAttendance = async (
  deps: AppDeps,
  tenantId: string,
  query: { employeeId?: string; from?: string; to?: string }
) => {
  const clauses = [
    eq(attendance.tenantId, tenantId),
    query.employeeId ? eq(attendance.employeeId, query.employeeId) : undefined,
    query.from ? gte(attendance.workDate, query.from) : undefined,
    query.to ? lte(attendance.workDate, query.to) : undefined
  ].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(attendance)
    .where(and(...clauses))
    .orderBy(desc(attendance.workDate))
    .limit(500);
};

export const createShift = async (
  deps: AppDeps,
  tenantId: string,
  input: { employeeId: string; branchId?: string; startAt: string; endAt: string; role?: string }
) => {
  const inserted = await deps.db
    .insert(shifts)
    .values({
      tenantId,
      employeeId: input.employeeId,
      branchId: input.branchId ?? null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      role: input.role ?? null
    })
    .returning();
  return inserted[0];
};

export const listShifts = async (deps: AppDeps, tenantId: string, from?: string, to?: string) => {
  const clauses = [
    eq(shifts.tenantId, tenantId),
    from ? gte(shifts.startAt, new Date(from)) : undefined,
    to ? lte(shifts.startAt, new Date(to)) : undefined
  ].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(shifts)
    .where(and(...clauses))
    .orderBy(asc(shifts.startAt))
    .limit(500);
};

export const createLeave = async (
  deps: AppDeps,
  tenantId: string,
  input: { employeeId: string; fromDate: string; toDate: string; type?: string; reason?: string }
) => {
  const inserted = await deps.db
    .insert(leaveRequests)
    .values({
      tenantId,
      employeeId: input.employeeId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      type: input.type ?? 'ANNUAL',
      reason: input.reason ?? null
    })
    .returning();
  return inserted[0];
};

export const setLeaveStatus = async (
  deps: AppDeps,
  tenantId: string,
  id: string,
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
) => {
  const updated = await deps.db
    .update(leaveRequests)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Leave request not found');
  return row;
};

const employeeBalance = async (tx: Db, tenantId: string, employeeId: string): Promise<bigint> => {
  const rows = await tx
    .select({ balanceAfter: employeeLedgerEntries.balanceAfter })
    .from(employeeLedgerEntries)
    .where(
      and(
        eq(employeeLedgerEntries.tenantId, tenantId),
        eq(employeeLedgerEntries.employeeId, employeeId)
      )
    )
    .orderBy(desc(employeeLedgerEntries.createdAt))
    .limit(1);
  return rows[0] ? toUnits(rows[0].balanceAfter) : 0n;
};

export const recordEmployeeLedger = async (
  tx: Db,
  input: {
    tenantId: string;
    employeeId: string;
    entryType: 'SALARY' | 'ADVANCE' | 'COMMISSION' | 'DEDUCTION' | 'PAYMENT';
    debit?: string;
    credit?: string;
    reference?: string | null;
  }
): Promise<void> => {
  const previous = await employeeBalance(tx, input.tenantId, input.employeeId);
  const debit = toUnits(input.debit ?? '0');
  const credit = toUnits(input.credit ?? '0');
  const balance = add(previous, subtract(debit, credit));
  await tx.insert(employeeLedgerEntries).values({
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    entryType: input.entryType,
    debit: fromUnits(debit),
    credit: fromUnits(credit),
    balanceAfter: fromUnits(balance),
    reference: input.reference ?? null
  });
};

export const issueAdvance = async (
  deps: AppDeps,
  tenantId: string,
  input: { employeeId: string; amount: string; reason?: string }
) => {
  return deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const inserted = await tx
      .insert(employeeAdvances)
      .values({
        tenantId,
        employeeId: input.employeeId,
        amount: input.amount,
        reason: input.reason ?? null
      })
      .returning();
    await recordEmployeeLedger(tx, {
      tenantId,
      employeeId: input.employeeId,
      entryType: 'ADVANCE',
      debit: input.amount
    });
    return inserted[0];
  });
};

export const listEmployeeLedger = async (deps: AppDeps, tenantId: string, employeeId: string) => {
  const entries = await deps.db
    .select()
    .from(employeeLedgerEntries)
    .where(
      and(
        eq(employeeLedgerEntries.tenantId, tenantId),
        eq(employeeLedgerEntries.employeeId, employeeId)
      )
    )
    .orderBy(desc(employeeLedgerEntries.createdAt))
    .limit(200);
  return { entries, balance: fromUnits(await employeeBalance(deps.db, tenantId, employeeId)) };
};
