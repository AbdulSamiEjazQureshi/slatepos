import { Elysia, t } from 'elysia';
import { and, branches, eq, inArray } from '@roms/database';
import type { Permission } from '@roms/contracts/permissions';
import type { RealtimeEvent } from '@roms/contracts/events';
import { RealtimeTopic } from '@roms/contracts/events';
import type { AppDeps } from '../../app/deps';
import { verifyJwt } from '../../lib/jwt';
import { hasGlobalBranchAccess, loadPrincipal } from '../../infrastructure/principal';
import { corePlugin } from '../../plugins/core';
import type { RealtimeHub } from '../../infrastructure/realtime';

type SocketData = { query: { token?: string }; headers: Record<string, string | undefined> };
type SocketSender = {
  send: (data: string) => void;
  close: (code?: number, message?: string) => void;
};

type Client = {
  granted: Set<string>;
  expiry: ReturnType<typeof setTimeout>;
  topics: Map<string, () => void>;
};

/**
 * WebSocket endpoint. Clients authenticate with an access token (query param or
 * Authorization header) and receive only the events for topics they are allowed
 * to see. Raw database rows are never sent — only typed event contracts.
 */
export const realtimeModule = (deps: AppDeps) => {
  const clients = new Map<object, Client>();

  const allowedTopics = (
    branchIds: string[],
    userId: string,
    permissions: ReadonlySet<Permission>
  ): Set<string> => {
    const set = new Set<string>();
    for (const branchId of branchIds) {
      if (permissions.has('orders.read')) set.add(RealtimeTopic.branchOrders(branchId));
      if (permissions.has('tables.read')) set.add(RealtimeTopic.branchTables(branchId));
      if (permissions.has('kitchen.read')) set.add(RealtimeTopic.branchKitchen(branchId));
      if (permissions.has('payments.read')) set.add(RealtimeTopic.branchPayments(branchId));
    }
    set.add(RealtimeTopic.user(userId));
    return set;
  };

  const isPermitted = (client: Client, topic: string): boolean => client.granted.has(topic);

  const attach = (hub: RealtimeHub, ws: SocketSender, client: Client, topic: string): void => {
    if (client.topics.has(topic)) return;
    if (!isPermitted(client, topic)) {
      ws.send(JSON.stringify({ type: 'error', message: `Not permitted to subscribe to ${topic}` }));
      return;
    }
    const unsubscribe = hub.subscribe(topic, (event: RealtimeEvent) => {
      try {
        ws.send(JSON.stringify(event));
      } catch {
        // Socket closed; cleanup happens in close().
      }
    });
    client.topics.set(topic, unsubscribe);
  };

  return new Elysia({ tags: ['realtime'] }).use(corePlugin(deps)).ws('/api/ws', {
    query: t.Object({ token: t.Optional(t.String()) }),
    async open(ws) {
      const data = ws.data as unknown as SocketData;
      const bearer = data.headers['authorization'];
      const token =
        data.query.token ?? (bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined);
      if (!token) {
        ws.close(4401, 'Authentication required');
        return;
      }
      const verified = await verifyJwt(token, deps.config.auth.jwtSecret);
      if (!verified.valid) {
        ws.close(4401, 'Invalid token');
        return;
      }
      const principal = await loadPrincipal(deps.db, deps.cache, verified.payload.sub);
      if (!principal || principal.status !== 'ACTIVE') {
        ws.close(4401, 'Unknown user');
        return;
      }

      // Wildcard roles widen scope inside their tenant, never across tenants.
      const branchRows = principal.tenantId
        ? await deps.db
            .select({ id: branches.id })
            .from(branches)
            .where(
              and(
                eq(branches.tenantId, principal.tenantId),
                eq(branches.isActive, true),
                hasGlobalBranchAccess(principal)
                  ? undefined
                  : inArray(branches.id, [...principal.branchIds])
              )
            )
        : [];
      if (ws.raw.readyState !== 1) return;
      const client: Client = {
        granted: allowedTopics(
          branchRows.map((row) => row.id),
          principal.userId,
          principal.permissions
        ),
        expiry: setTimeout(
          () => ws.close(4401, 'Session expired'),
          Math.max(0, verified.payload.exp * 1000 - Date.now())
        ),
        topics: new Map()
      };
      client.expiry.unref();
      // Elysia creates a wrapper for each callback; raw identifies the connection.
      clients.set(ws.raw, client);

      for (const topic of client.granted) attach(deps.realtime, ws, client, topic);
      ws.send(JSON.stringify({ type: 'ready', topics: [...client.granted] }));
    },
    message(ws, raw) {
      const message = raw as { type?: string; topic?: string };
      const client = clients.get(ws.raw);
      if (!client) return;

      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (typeof message.topic !== 'string') return;

      if (message.type === 'subscribe') {
        attach(deps.realtime, ws, client, message.topic);
        return;
      }
      if (message.type === 'unsubscribe') {
        const unsubscribe = client.topics.get(message.topic);
        if (unsubscribe) {
          unsubscribe();
          client.topics.delete(message.topic);
        }
      }
    },
    close(ws) {
      const client = clients.get(ws.raw);
      if (client) {
        clearTimeout(client.expiry);
        for (const unsubscribe of client.topics.values()) unsubscribe();
        clients.delete(ws.raw);
      }
    }
  });
};
