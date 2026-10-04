import { Elysia } from 'elysia';
import { and, count, desc, eq, gte, lte } from '@roms/database';
import { auditLogs } from '@roms/database';
import { z } from 'zod';
import { listQuerySchema, uuidSchema } from '@roms/contracts/common';
import { normalizePagination } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { page } from '../../lib/http';
import { authPlugin } from '../../plugins/auth';

const auditQuerySchema = listQuerySchema.extend({
  entity: z.string().max(80).optional(),
  entityId: z.string().max(80).optional(),
  action: z.string().max(80).optional(),
  userId: uuidSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export const auditModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/audit-logs', tags: ['users'] }).use(authPlugin(deps)).get(
    '/',
    async ({ ctx, query }) => {
      const tenantId = requireTenantId(ctx);
      const pagination = normalizePagination(query);
      const clauses = [
        eq(auditLogs.tenantId, tenantId),
        query.entity ? eq(auditLogs.entity, query.entity) : undefined,
        query.entityId ? eq(auditLogs.entityId, query.entityId) : undefined,
        query.action ? eq(auditLogs.action, query.action) : undefined,
        query.userId ? eq(auditLogs.userId, query.userId) : undefined,
        query.from ? gte(auditLogs.createdAt, new Date(query.from)) : undefined,
        query.to ? lte(auditLogs.createdAt, new Date(query.to)) : undefined
      ].filter((clause) => clause !== undefined);
      const where = and(...clauses);

      const [rows, totals] = await Promise.all([
        deps.db
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize),
        deps.db.select({ value: count() }).from(auditLogs).where(where)
      ]);

      return page(
        rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          branchId: row.branchId,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          oldValues: row.oldValues,
          newValues: row.newValues,
          ipAddress: row.ipAddress,
          requestId: row.requestId,
          createdAt: row.createdAt.toISOString()
        })),
        totals[0]?.value ?? 0,
        pagination
      );
    },
    {
      requireTenant: true,
      requirePermission: 'audit.read',
      query: auditQuerySchema,
      detail: { summary: 'Query the append-only audit trail' }
    }
  );
