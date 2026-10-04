import { and, asc, desc, eq, inArray } from '@roms/database';
import { kitchenStations, kitchenTickets, orderItems, orders, type Db } from '@roms/database';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';

/** Create the kitchen ticket for an order if it does not exist yet. */
export const ensureKitchenTicket = async (
  tx: Db,
  tenantId: string,
  branchId: string,
  orderId: string
): Promise<void> => {
  await tx
    .insert(kitchenTickets)
    .values({ tenantId, branchId, orderId, status: 'NEW' })
    .onConflictDoNothing({ target: kitchenTickets.orderId });
};

export const voidKitchenTicket = async (tx: Db, orderId: string): Promise<void> => {
  await tx
    .update(kitchenTickets)
    .set({ status: 'VOID', updatedAt: new Date() })
    .where(eq(kitchenTickets.orderId, orderId));
};

export const listStations = async (deps: AppDeps, tenantId: string, branchId?: string) => {
  const clauses = [
    eq(kitchenStations.tenantId, tenantId),
    branchId ? eq(kitchenStations.branchId, branchId) : undefined
  ].filter((clause) => clause !== undefined);
  return deps.db
    .select()
    .from(kitchenStations)
    .where(and(...clauses))
    .orderBy(asc(kitchenStations.name));
};

export const createStation = async (
  deps: AppDeps,
  tenantId: string,
  branchId: string,
  name: string
) => {
  const inserted = await deps.db
    .insert(kitchenStations)
    .values({ tenantId, branchId, name })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create station');
  return row;
};

export type KitchenTicketView = {
  ticket: typeof kitchenTickets.$inferSelect;
  order: {
    id: string;
    number: string;
    type: string;
    status: string;
    tableId: string | null;
    createdAt: string;
  };
  items: { id: string; name: string; quantity: number; status: string; notes: string | null }[];
};

export const listTickets = async (
  deps: AppDeps,
  tenantId: string,
  query: { branchId?: string; status?: string }
): Promise<KitchenTicketView[]> => {
  const clauses = [
    eq(kitchenTickets.tenantId, tenantId),
    query.branchId ? eq(kitchenTickets.branchId, query.branchId) : undefined,
    query.status
      ? eq(kitchenTickets.status, query.status as typeof kitchenTickets.$inferSelect.status)
      : undefined
  ].filter((clause) => clause !== undefined);
  const tickets = await deps.db
    .select()
    .from(kitchenTickets)
    .where(and(...clauses))
    .orderBy(desc(kitchenTickets.priority), asc(kitchenTickets.createdAt))
    .limit(100);
  if (tickets.length === 0) return [];

  const orderIds = tickets.map((ticket) => ticket.orderId);
  const [orderRows, itemRows] = await Promise.all([
    deps.db.select().from(orders).where(inArray(orders.id, orderIds)),
    deps.db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
  ]);

  return tickets.map((ticket) => {
    const order = orderRows.find((row) => row.id === ticket.orderId);
    return {
      ticket,
      order: {
        id: ticket.orderId,
        number: order?.number ?? '',
        type: order?.type ?? '',
        status: order?.status ?? '',
        tableId: order?.tableId ?? null,
        createdAt: order?.createdAt.toISOString() ?? ''
      },
      items: itemRows
        .filter((item) => item.orderId === ticket.orderId)
        .map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          status: item.status,
          notes: item.notes
        }))
    };
  });
};

export const setTicketStatus = async (
  deps: AppDeps,
  tenantId: string,
  ticketId: string,
  status: 'NEW' | 'PREPARING' | 'READY' | 'SERVED' | 'VOID'
) => {
  const now = new Date();
  const updated = await deps.db
    .update(kitchenTickets)
    .set({
      status,
      updatedAt: now,
      ...(status === 'PREPARING' ? { startedAt: now } : {}),
      ...(status === 'READY' ? { readyAt: now } : {}),
      ...(status === 'SERVED' ? { servedAt: now } : {})
    })
    .where(and(eq(kitchenTickets.id, ticketId), eq(kitchenTickets.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Kitchen ticket not found');
  return row;
};

export const setTicketPriority = async (
  deps: AppDeps,
  tenantId: string,
  ticketId: string,
  priority: number
) => {
  const updated = await deps.db
    .update(kitchenTickets)
    .set({ priority, updatedAt: new Date() })
    .where(and(eq(kitchenTickets.id, ticketId), eq(kitchenTickets.tenantId, tenantId)))
    .returning();
  const row = updated[0];
  if (!row) throw AppError.notFound('Kitchen ticket not found');
  return row;
};
