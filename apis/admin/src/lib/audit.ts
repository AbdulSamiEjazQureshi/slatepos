import { auditLogs, type Db } from '@roms/database';
import type { RequestContext } from './context';

export type AuditInput = {
  action: string;
  entity: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
};

/**
 * Append an audit record. Never pass secrets, tokens or card data here — the
 * shape is intentionally generic and callers own what they include.
 */
export const recordAudit = async (
  db: Db,
  ctx: RequestContext,
  input: AuditInput
): Promise<void> => {
  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    oldValues: input.oldValues ?? null,
    newValues: input.newValues ?? null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId
  });
};
