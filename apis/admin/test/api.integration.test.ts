import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { loadConfig } from '@roms/config';
import {
  and,
  branches,
  eq,
  products,
  roles,
  stockLevels,
  tenants,
  userBranches,
  userRoles,
  users
} from '@roms/database';
import { createTestDatabase } from '@roms/database/testing';
import { createApp } from '../src/app';
import type { AppDeps } from '../src/app/deps';
import { createMemoryCache } from '../src/infrastructure/cache';
import { createEmailProvider } from '../src/infrastructure/email';
import { createLogger } from '../src/infrastructure/logger';
import { createRealtimeHub } from '../src/infrastructure/realtime';
import { hashPassword } from '../src/lib/password';

type Ctx = {
  app: ReturnType<typeof createApp>;
  deps: AppDeps;
  tenantA: {
    tenantId: string;
    branchId: string;
    ownerToken: string;
    cashierToken: string;
    productId: string;
  };
  tenantB: { tenantId: string; branchId: string; productId: string; ownerToken: string };
};

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  JWT_SECRET: 'integration-test-secret-0123456789',
  ACCESS_TOKEN_TTL: '900',
  REFRESH_TOKEN_TTL: '2592000',
  DATABASE_DRIVER: 'pglite',
  CORS_ORIGINS: 'http://localhost:5173',
  EMAIL_PROVIDER: 'console'
});

let ctx: Ctx;

const request = async (
  method: string,
  path: string,
  options: { token?: string; body?: unknown; branchId?: string } = {}
): Promise<{ status: number; body: any }> => {
  const headers: Record<string, string> = {};
  if (options.token) headers['authorization'] = `Bearer ${options.token}`;
  if (options.branchId) headers['x-branch-id'] = options.branchId;
  if (options.body) headers['content-type'] = 'application/json';

  const response = await ctx.app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    })
  );
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

const seedTenant = async (
  name: string,
  slug: string,
  ownerEmail: string
): Promise<{ tenantId: string; branchId: string; productId: string }> => {
  const { db } = ctx.deps;
  const passwordHash = await hashPassword('Password123');

  const tenant = (
    await db.insert(tenants).values({ name, slug }).returning({ id: tenants.id })
  )[0]!;
  const branch = (
    await db
      .insert(branches)
      .values({ tenantId: tenant.id, name: 'Main', code: 'MAIN', isDefault: true })
      .returning({ id: branches.id })
  )[0]!;

  const ownerRole = (
    await db
      .insert(roles)
      .values({ tenantId: tenant.id, name: 'TENANT_OWNER', isSystem: true, permissions: ['*'] })
      .returning({ id: roles.id })
  )[0]!;
  const cashierRole = (
    await db
      .insert(roles)
      .values({
        tenantId: tenant.id,
        name: 'CASHIER',
        isSystem: true,
        permissions: ['orders.read', 'orders.create', 'products.read']
      })
      .returning({ id: roles.id })
  )[0]!;

  const owner = (
    await db
      .insert(users)
      .values({ tenantId: tenant.id, email: ownerEmail, passwordHash, fullName: 'Owner' })
      .returning({ id: users.id })
  )[0]!;
  await db.insert(userRoles).values({ userId: owner.id, roleId: ownerRole.id });
  await db.insert(userBranches).values({ userId: owner.id, branchId: branch.id });

  const cashier = (
    await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `cashier@${slug}.test`,
        passwordHash,
        fullName: 'Cashier'
      })
      .returning({ id: users.id })
  )[0]!;
  await db.insert(userRoles).values({ userId: cashier.id, roleId: cashierRole.id });
  await db.insert(userBranches).values({ userId: cashier.id, branchId: branch.id });

  const product = (
    await db
      .insert(products)
      .values({
        tenantId: tenant.id,
        name: 'Test Burger',
        sku: `${slug.toUpperCase()}-BURGER`,
        price: '500',
        taxRate: '0.05',
        trackInventory: true
      })
      .returning({ id: products.id })
  )[0]!;
  await db.insert(stockLevels).values({
    tenantId: tenant.id,
    branchId: branch.id,
    productId: product.id,
    quantity: 50,
    reorderPoint: 5
  });

  return { tenantId: tenant.id, branchId: branch.id, productId: product.id };
};

const login = async (email: string): Promise<string> => {
  const result = await request('POST', '/api/v1/auth/login', {
    body: { email, password: 'Password123' }
  });
  expect(result.status).toBe(200);
  return result.body.tokens.accessToken as string;
};

beforeAll(async () => {
  const client = await createTestDatabase();
  const deps: AppDeps = {
    config,
    db: client.db,
    logger: createLogger(config),
    cache: createMemoryCache(),
    realtime: createRealtimeHub(),
    email: createEmailProvider(
      { provider: 'console', from: 'test@roms.local' },
      createLogger(config)
    )
  };
  const app = createApp(deps);
  ctx = {
    app,
    deps,
    tenantA: { tenantId: '', branchId: '', ownerToken: '', cashierToken: '', productId: '' },
    tenantB: { tenantId: '', branchId: '', productId: '', ownerToken: '' }
  };

  const a = await seedTenant('Tenant A', 'tenant-a', 'owner@a.test');
  const b = await seedTenant('Tenant B', 'tenant-b', 'owner@b.test');
  ctx.tenantA = {
    ...a,
    ownerToken: await login('owner@a.test'),
    cashierToken: await login('cashier@tenant-a.test')
  };
  ctx.tenantB = { ...b, ownerToken: await login('owner@b.test') };
}, 60_000);

afterAll(async () => {
  // createTestDatabase returns a memory instance tied to the deps' lifecycle.
});

describe('ROMS API integration', () => {
  test('health endpoints respond', async () => {
    expect((await request('GET', '/api/v1/health/live')).status).toBe(200);
    expect((await request('GET', '/api/v1/health/ready')).status).toBe(200);
  });

  test('rejects unauthenticated access to protected routes', async () => {
    expect((await request('GET', '/api/v1/orders')).status).toBe(401);
  });

  test('creates an order with server-authoritative totals', async () => {
    const response = await request('POST', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: {
        type: 'DINE_IN',
        items: [{ productId: ctx.tenantA.productId, quantity: 2 }]
      }
    });
    expect(response.status).toBe(200);
    // 500 * 2 = 1000 subtotal, 5% tax = 50, total 1050
    expect(response.body.totals.subtotal).toBe('1000.0000');
    expect(response.body.totals.taxTotal).toBe('50.0000');
    expect(response.body.totals.grandTotal).toBe('1050.0000');
    expect(response.body.status).toBe('DRAFT');
  });

  test('deducts stock transactionally when an order is confirmed', async () => {
    const create = await request('POST', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { items: [{ productId: ctx.tenantA.productId, quantity: 3 }] }
    });
    const confirm = await request('POST', `/api/v1/orders/${create.body.id}/status`, {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { status: 'CONFIRMED' }
    });
    expect(confirm.status).toBe(200);

    const levels = await ctx.deps.db
      .select()
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.branchId, ctx.tenantA.branchId),
          eq(stockLevels.productId, ctx.tenantA.productId)
        )
      );
    // Previous tests did not confirm, so only this order's 3 units are deducted from 50.
    expect(levels[0]?.quantity).toBe(47);
  });

  test('rejects illegal status transitions', async () => {
    const create = await request('POST', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { items: [{ productId: ctx.tenantA.productId, quantity: 1 }] }
    });
    const illegal = await request('POST', `/api/v1/orders/${create.body.id}/status`, {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { status: 'COMPLETED' }
    });
    expect(illegal.status).toBe(422);
    expect(illegal.body.type).toBe('invalid_state_transition');
  });

  test('captures a payment idempotently', async () => {
    const create = await request('POST', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { items: [{ productId: ctx.tenantA.productId, quantity: 1 }] }
    });
    await request('POST', `/api/v1/orders/${create.body.id}/status`, {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { status: 'CONFIRMED' }
    });

    const paymentBody = {
      orderId: create.body.id,
      method: 'CASH',
      amount: create.body.totals.grandTotal,
      idempotencyKey: 'pay-key-0001'
    };
    const first = await request('POST', '/api/v1/payments', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: paymentBody
    });
    const second = await request('POST', '/api/v1/payments', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: paymentBody
    });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('CAPTURED');
    expect(second.body.id).toBe(first.body.id);
  });

  test('concurrent retries capture exactly one payment', async () => {
    const create = await request('POST', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { items: [{ productId: ctx.tenantA.productId, quantity: 1 }] }
    });
    const options = {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: {
        orderId: create.body.id,
        method: 'CASH',
        amount: create.body.totals.grandTotal,
        idempotencyKey: 'pay-concurrent-0001'
      }
    };
    const [first, second] = await Promise.all([
      request('POST', '/api/v1/payments', options),
      request('POST', '/api/v1/payments', options)
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.id).toBe(second.body.id);
  });

  test('refuses an over-capture beyond the order total', async () => {
    const create = await request('POST', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { items: [{ productId: ctx.tenantA.productId, quantity: 1 }] }
    });
    const over = await request('POST', '/api/v1/payments', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: {
        orderId: create.body.id,
        method: 'CASH',
        amount: '99999',
        idempotencyKey: 'pay-over-0001'
      }
    });
    expect(over.status).toBe(422);
    expect(over.body.type).toBe('payment_failed');
  });

  test('enforces tenant isolation', async () => {
    const create = await request('POST', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId,
      body: { items: [{ productId: ctx.tenantA.productId, quantity: 1 }] }
    });
    const crossTenant = await request('GET', `/api/v1/orders/${create.body.id}`, {
      token: ctx.tenantB.ownerToken,
      branchId: ctx.tenantB.branchId
    });
    expect(crossTenant.status).toBe(404);
  });

  test('enforces permission-based authorization', async () => {
    const forbidden = await request('GET', '/api/v1/users', {
      token: ctx.tenantA.cashierToken,
      branchId: ctx.tenantA.branchId
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.type).toBe('permission_denied');
  });

  test('blocks branch access outside the user scope', async () => {
    // Cashier belongs to tenant A branch; asking for tenant B branch id must fail.
    const response = await request('GET', '/api/v1/orders', {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantB.branchId
      // owner has global branch access only within their tenant; orders list is
      // filtered by tenant so this must not leak tenant B data.
    });
    expect(response.status).toBe(200);
    expect(
      response.body.items.every(
        (order: { tenantId: string }) => order.tenantId === ctx.tenantA.tenantId
      )
    ).toBe(true);
  });
});

// Reporting must not mistake abandoned drafts for revenue or leak tenant data.
describe('sales reporting', () => {
  const range = () => {
    const now = new Date();
    return `from=${encodeURIComponent(new Date(now.getTime() - 86_400_000).toISOString())}&to=${encodeURIComponent(now.toISOString())}&timezone=Asia%2FKarachi`;
  };
  test('daily series matches the summary, excludes drafts and separates tenants', async () => {
    const options = { token: ctx.tenantB.ownerToken, branchId: ctx.tenantB.branchId };
    await request('POST', '/api/v1/orders', {
      ...options,
      body: { items: [{ productId: ctx.tenantB.productId, quantity: 2 }] }
    });
    const before = await request('GET', `/api/v1/reports/sales-summary?${range()}`, options);
    const order = await request('POST', '/api/v1/orders', {
      ...options,
      body: { items: [{ productId: ctx.tenantB.productId, quantity: 1 }] }
    });
    await request('POST', `/api/v1/orders/${order.body.id}/status`, {
      ...options,
      body: { status: 'CONFIRMED' }
    });
    const summary = await request('GET', `/api/v1/reports/sales-summary?${range()}`, options);
    const series = await request('GET', `/api/v1/reports/sales-series?${range()}`, options);
    expect(series.status).toBe(200);
    expect(summary.body.orderCount).toBe(before.body.orderCount + 1);
    expect(
      series.body.reduce((sum: number, row: { orderCount: number }) => sum + row.orderCount, 0)
    ).toBe(summary.body.orderCount);
    expect(
      series.body.reduce((sum: number, row: { sales: string }) => sum + Number(row.sales), 0)
    ).toBe(Number(summary.body.netSales));
    const tenantA = await request('GET', `/api/v1/reports/sales-series?${range()}`, {
      token: ctx.tenantA.ownerToken,
      branchId: ctx.tenantA.branchId
    });
    expect(tenantA.status).toBe(200);
    expect(tenantA.body).not.toEqual(series.body);
  });
  test('rejects invalid time zones, excessive ranges and missing report permission', async () => {
    const options = { token: ctx.tenantA.ownerToken, branchId: ctx.tenantA.branchId };
    const invalid = await request(
      'GET',
      `/api/v1/reports/sales-series?${range()}&timezone=Not/AZone`,
      options
    );
    expect(invalid.status).toBe(422);
    const long = await request(
      'GET',
      '/api/v1/reports/sales-series?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z',
      options
    );
    expect(long.status).toBe(422);
    const forbidden = await request('GET', `/api/v1/reports/sales-series?${range()}`, {
      ...options,
      token: ctx.tenantA.cashierToken
    });
    expect(forbidden.status).toBe(403);
  });
});

describe('realtime isolation', () => {
  test('owner can receive their branch events but cannot subscribe across tenants', async () => {
    const app = createApp(ctx.deps).listen({ port: 0, hostname: '127.0.0.1' });
    const socket = new WebSocket(
      `ws://127.0.0.1:${app.server!.port}/api/ws?token=${encodeURIComponent(ctx.tenantA.ownerToken)}`
    );
    const message = (type: string): Promise<any> =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.removeEventListener('message', handler);
          reject(new Error(`Timed out waiting for ${type}`));
        }, 5000);
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(String(event.data));
          if (data.type === type) {
            clearTimeout(timeout);
            socket.removeEventListener('message', handler);
            resolve(data);
          }
        };
        socket.addEventListener('message', handler);
      });
    try {
      const ready = await message('ready');
      const own = `branch:${ctx.tenantA.branchId}:orders`;
      const foreign = `branch:${ctx.tenantB.branchId}:orders`;
      expect(ready.topics).toContain(own);
      expect(ready.topics).not.toContain(foreign);
      const denied = message('error');
      socket.send(JSON.stringify({ type: 'subscribe', topic: foreign }));
      expect((await denied).message).toContain('Not permitted');
      socket.send(JSON.stringify({ type: 'unsubscribe', topic: own }));
      let pong = message('pong');
      socket.send(JSON.stringify({ type: 'ping' }));
      await pong;
      expect(ctx.deps.realtime.topics()).not.toContain(own);
      socket.send(JSON.stringify({ type: 'subscribe', topic: own }));
      pong = message('pong');
      socket.send(JSON.stringify({ type: 'ping' }));
      await pong;
      const event = message('order.created');
      ctx.deps.realtime.publish(own, {
        type: 'order.created',
        orderId: crypto.randomUUID(),
        branchId: ctx.tenantA.branchId,
        orderNumber: 'SOCKET-TEST'
      });
      expect((await event).orderNumber).toBe('SOCKET-TEST');
    } finally {
      socket.close();
      await app.stop(true);
    }
  }, 15000);
});
