import { documentCounters, sql, type Db } from '@roms/database';

/**
 * Allocate the next sequential document number for a tenant and scope
 * (`PO`, `GRN`, `RET`, `JRN`, …). Uses an atomic upsert so concurrent callers
 * never receive the same number.
 */
export const nextDocumentNumber = async (
  tx: Db,
  tenantId: string,
  scope: string,
  prefix: string,
  padding = 5
): Promise<string> => {
  const rows = await tx
    .insert(documentCounters)
    .values({ tenantId, scope, nextValue: 1 })
    .onConflictDoUpdate({
      target: [documentCounters.tenantId, documentCounters.scope],
      set: { nextValue: sql`${documentCounters.nextValue} + 1` }
    })
    .returning({ nextValue: documentCounters.nextValue });
  const value = rows[0]?.nextValue ?? 1;
  return `${prefix}-${String(value).padStart(padding, '0')}`;
};
