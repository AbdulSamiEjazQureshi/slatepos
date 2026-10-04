import { Elysia } from 'elysia';
import { z } from 'zod';
import { moneySchema, rateSchema, uuidSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import {
  createDepartment,
  createEmployee,
  createLeave,
  createShift,
  issueAdvance,
  listAttendance,
  listDepartments,
  listEmployeeLedger,
  listEmployees,
  listShifts,
  recordAttendance,
  setLeaveStatus,
  updateEmployee
} from './workforce.service';

/**
 * The fields shared by create and update, with no defaults attached.
 *
 * `.partial()` wraps a `ZodDefault` without disabling it, so a schema that
 * carries `.default('0')` hands that value to *every* PATCH — an employee on
 * HOURLY/500 would be silently reset to MONTHLY/0 by a request that only
 * changed their phone number. The defaults therefore live on `employeeCreate`
 * alone, and the update body is built from this defaultless base.
 */
const employeeFields = {
  fullName: z.string().trim().min(2).max(160),
  branchId: uuidSchema.nullable().optional(),
  departmentId: uuidSchema.nullable().optional(),
  phone: z.string().trim().max(40).optional(),
  position: z.string().trim().max(80).optional(),
  hireDate: z.string().optional().nullable(),
  salaryType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']),
  salaryAmount: moneySchema,
  commissionRate: rateSchema
};

const employeeCreate = z.object({
  ...employeeFields,
  salaryType: employeeFields.salaryType.default('MONTHLY'),
  salaryAmount: employeeFields.salaryAmount.default('0'),
  commissionRate: employeeFields.commissionRate.default('0')
});

const employeeUpdate = z
  .object(employeeFields)
  .partial()
  .extend({ status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional() });

export const workforceModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/workforce', tags: ['workforce'] })
    .use(authPlugin(deps))
    .get('/departments', async ({ ctx }) => listDepartments(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'staff.read'
    })
    .post(
      '/departments',
      async ({ ctx, body }) => createDepartment(deps, requireTenantId(ctx), body.name),
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: z.object({ name: z.string().trim().min(1).max(80) })
      }
    )
    .get('/employees', async ({ ctx, query }) => listEmployees(deps, requireTenantId(ctx), query), {
      requireTenant: true,
      requirePermission: 'staff.read',
      query: z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().optional(),
        q: z.string().optional(),
        branchId: uuidSchema.optional()
      })
    })
    .post('/employees', async ({ ctx, body }) => createEmployee(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'staff.manage',
      body: employeeCreate
    })
    .patch(
      '/employees/:id',
      async ({ ctx, params, body }) => updateEmployee(deps, requireTenantId(ctx), params.id, body),
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: employeeUpdate
      }
    )
    .get(
      '/employees/:id/ledger',
      async ({ ctx, params }) => listEmployeeLedger(deps, requireTenantId(ctx), params.id),
      {
        requireTenant: true,
        requirePermission: 'staff.read'
      }
    )
    .get(
      '/attendance',
      async ({ ctx, query }) => listAttendance(deps, requireTenantId(ctx), query),
      {
        requireTenant: true,
        requirePermission: 'staff.read',
        query: z.object({
          employeeId: uuidSchema.optional(),
          from: z.string().optional(),
          to: z.string().optional()
        })
      }
    )
    .post(
      '/attendance',
      async ({ ctx, body }) => recordAttendance(deps, requireTenantId(ctx), body),
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: z.object({
          employeeId: uuidSchema,
          workDate: z.string(),
          status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HOLIDAY']).default('PRESENT'),
          source: z.enum(['MANUAL', 'BIOMETRIC']).default('MANUAL'),
          checkIn: z.string().datetime({ offset: true }).nullable().optional(),
          checkOut: z.string().datetime({ offset: true }).nullable().optional(),
          notes: z.string().max(300).optional()
        })
      }
    )
    .get(
      '/shifts',
      async ({ ctx, query }) => listShifts(deps, requireTenantId(ctx), query.from, query.to),
      {
        requireTenant: true,
        requirePermission: 'staff.read',
        query: z.object({ from: z.string().optional(), to: z.string().optional() })
      }
    )
    .post('/shifts', async ({ ctx, body }) => createShift(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'staff.manage',
      body: z.object({
        employeeId: uuidSchema,
        branchId: uuidSchema.optional(),
        startAt: z.string().datetime({ offset: true }),
        endAt: z.string().datetime({ offset: true }),
        role: z.string().max(60).optional()
      })
    })
    .post('/leaves', async ({ ctx, body }) => createLeave(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'staff.manage',
      body: z.object({
        employeeId: uuidSchema,
        fromDate: z.string(),
        toDate: z.string(),
        type: z.string().max(40).optional(),
        reason: z.string().max(400).optional()
      })
    })
    .post(
      '/leaves/:id/status',
      async ({ ctx, params, body }) =>
        setLeaveStatus(deps, requireTenantId(ctx), params.id, body.status),
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: z.object({ status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED']) })
      }
    )
    .post('/advances', async ({ ctx, body }) => issueAdvance(deps, requireTenantId(ctx), body), {
      requireTenant: true,
      requirePermission: 'staff.manage',
      body: z.object({
        employeeId: uuidSchema,
        amount: moneySchema,
        reason: z.string().max(200).optional()
      })
    });
