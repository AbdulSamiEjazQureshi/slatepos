import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { loadConfig } from '@roms/config';
import {
  branches,
  deliveries,
  deliveryZones,
  eq,
  orderItems,
  orders,
  products,
  riders,
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
  tenantId: string;
  branchId: string;
  token: string;
  dishId: string;
  flourId: string;
  orderId: string;
};

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  JWT_SECRET: 'delivery-recipes-test-secret-0123456789',
  ACCESS_TOKEN_TTL: '900',
  REFRESH_TOKEN_TTL: '2592000',
  DATABASE_DRIVER: 'pglite',
  CORS_ORIGINS: 'http://localhost:5173',
  EMAIL_PROVIDER: 'console'
});

let ctx: Ctx;
let closeDatabase: (() => Promise<void>) | undefined;

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

beforeAll(async () => {
  const client = await createTestDatabase();
  closeDatabase = client.close;
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

  const { db } = deps;
  const passwordHash = await hashPassword('Password123');

  const tenant = (
    await db
      .insert(tenants)
      .values({ name: 'Kitchen Co', slug: 'kitchen-co' })
      .returning({ id: tenants.id })
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
  const owner = (
    await db
      .insert(users)
      .values({ tenantId: tenant.id, email: 'owner@kitchen.test', passwordHash, fullName: 'Owner' })
      .returning({ id: users.id })
  )[0]!;
  await db.insert(userRoles).values({ userId: owner.id, roleId: ownerRole.id });
  await db.insert(userBranches).values({ userId: owner.id, branchId: branch.id });

  const [dish, flour] = await db
    .insert(products)
    .values([
      {
        tenantId: tenant.id,
        name: 'House Bread',
        sku: 'BREAD',
        price: '400',
        taxRate: '0',
        trackInventory: true,
        status: 'ACTIVE'
      },
      {
        tenantId: tenant.id,
        name: 'Flour',
        sku: 'FLOUR',
        price: '0',
        taxRate: '0',
        trackInventory: true,
        status: 'ACTIVE'
      }
    ])
    .returning({ id: products.id });

  await db.insert(stockLevels).values([
    {
      tenantId: tenant.id,
      branchId: branch.id,
      productId: flour!.id,
      quantity: 100,
      reorderPoint: 5
    },
    { tenantId: tenant.id, branchId: branch.id, productId: dish!.id, quantity: 0, reorderPoint: 0 }
  ]);

  const order = (
    await db
      .insert(orders)
      .values({
        tenantId: tenant.id,
        branchId: branch.id,
        number: '1001',
        type: 'DELIVERY',
        status: 'CONFIRMED',
        grandTotal: '400'
      })
      .returning({ id: orders.id })
  )[0]!;
  await db.insert(orderItems).values({
    orderId: order.id,
    tenantId: tenant.id,
    branchId: branch.id,
    productId: dish!.id,
    name: 'House Bread',
    quantity: 1,
    unitPrice: '400',
    lineSubtotal: '400',
    lineTotal: '400'
  });

  // `request` reads from ctx, so the context has to exist before the login
  // call that fills in its token.
  ctx = {
    app,
    deps,
    tenantId: tenant.id,
    branchId: branch.id,
    token: '',
    dishId: dish!.id,
    flourId: flour!.id,
    orderId: order.id
  };

  const login = await request('POST', '/api/v1/auth/login', {
    body: { email: 'owner@kitchen.test', password: 'Password123' }
  });
  ctx.token = login.body.tokens.accessToken;
}, 30_000);

afterAll(async () => {
  await closeDatabase?.();
});

describe('theoretical costing', () => {
  test('prices a line at quantity × unit cost, not a ten-thousandth of it', async () => {
    // 2.5 units at 4.0000 each = 10.0000. The old division by 10⁴ twice over
    // returned 0.0010 — a batch cost that looked free.
    const created = await request('POST', '/api/v1/recipes', {
      token: ctx.token,
      body: {
        productId: ctx.dishId,
        name: 'House Bread',
        yieldQuantity: '1',
        yieldUnit: 'loaf',
        items: [{ componentProductId: ctx.flourId, quantity: '2.5', unit: 'kg', unitCost: '4' }]
      }
    });

    expect(created.status).toBe(200);
    expect(created.body.theoreticalCost).toBe('10.0000');
  });

  test('applies wastage as a rate, not a whole-number multiplier', async () => {
    // 10% wastage on 2 units = 2.2 → 8.8 at 4.0000 each. Read as a fraction
    // the wastage would have been 1000%, giving 88.0000.
    const created = await request('POST', '/api/v1/recipes', {
      token: ctx.token,
      body: {
        productId: ctx.dishId,
        name: 'With waste',
        yieldQuantity: '1',
        yieldUnit: 'loaf',
        items: [
          {
            componentProductId: ctx.flourId,
            quantity: '2',
            unit: 'kg',
            wastageRate: '0.1',
            unitCost: '4'
          }
        ]
      }
    });

    expect(created.status).toBe(200);
    expect(created.body.theoreticalCost).toBe('8.8000');
  });
});

describe('producing a batch', () => {
  test('consumes stock for the wastage-adjusted quantity and values the output', async () => {
    const created = await request('POST', '/api/v1/recipes', {
      token: ctx.token,
      body: {
        productId: ctx.dishId,
        name: 'Produce me',
        yieldQuantity: '10',
        yieldUnit: 'loaf',
        items: [
          {
            componentProductId: ctx.flourId,
            quantity: '1',
            unit: 'kg',
            wastageRate: '0.1',
            unitCost: '4'
          }
        ]
      }
    });
    expect(created.status).toBe(200);

    await request('POST', `/api/v1/recipes/${created.body.id}/status`, {
      token: ctx.token,
      body: { status: 'ACTIVE' }
    });

    const produced = await request('POST', `/api/v1/recipes/${created.body.id}/produce`, {
      token: ctx.token,
      branchId: ctx.branchId,
      body: { quantity: 2 }
    });

    expect(produced.status).toBe(200);
    // The run comes back typed, not as `unknown`: 2 × ceil(1 × 1.1) = 3 units
    // consumed at 4.0000 = 12.0000 against 20 loaves produced.
    expect(produced.body.actualCost).toBe('12.0000');
    expect(produced.body.quantity).toBe(2);

    const levels = await ctx.deps.db
      .select({ quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(eq(stockLevels.productId, ctx.flourId));
    expect(levels[0]?.quantity).toBe(97);
  });
});

describe('dispatching a ticket', () => {
  test('creates a run, then applies a re-post instead of discarding it', async () => {
    const zone = (
      await ctx.deps.db
        .insert(deliveryZones)
        .values({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          name: 'DHA',
          fee: '150',
          minOrder: '0'
        })
        .returning({ id: deliveryZones.id })
    )[0]!;
    const rider = (
      await ctx.deps.db
        .insert(riders)
        .values({ tenantId: ctx.tenantId, name: 'Bilal', commissionRate: '0.1' })
        .returning({ id: riders.id })
    )[0]!;

    const created = await request('POST', '/api/v1/delivery/deliveries', {
      token: ctx.token,
      branchId: ctx.branchId,
      body: { orderId: ctx.orderId, zoneId: zone.id }
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.fee).toBe('150.0000');

    // Posting the same order again is how the board assigns a rider. Before,
    // this returned the stored row untouched and the assignment vanished.
    const again = await request('POST', '/api/v1/delivery/deliveries', {
      token: ctx.token,
      branchId: ctx.branchId,
      body: { orderId: ctx.orderId, riderId: rider.id }
    });
    expect(again.status).toBe(200);
    expect(again.body.riderId).toBe(rider.id);
    expect(again.body.status).toBe('ASSIGNED');
    // A re-post with no zone must not blank the fee already charged.
    expect(again.body.fee).toBe('150.0000');

    const rows = await ctx.deps.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.orderId, ctx.orderId));
    expect(rows).toHaveLength(1);
  });

  test('settling pays commission on fees actually carried', async () => {
    const rider = (
      await ctx.deps.db
        .insert(riders)
        .values({ tenantId: ctx.tenantId, name: 'Sana', commissionRate: '0.25' })
        .returning({ id: riders.id })
    )[0]!;
    const delivery = (
      await ctx.deps.db
        .select()
        .from(deliveries)
        .where(eq(deliveries.orderId, ctx.orderId))
        .limit(1)
    )[0]!;
    await ctx.deps.db
      .update(deliveries)
      .set({ riderId: rider.id, status: 'DELIVERED', deliveredAt: new Date() })
      .where(eq(deliveries.id, delivery.id));

    const settled = await request('POST', '/api/v1/delivery/settlements', {
      token: ctx.token,
      branchId: ctx.branchId,
      body: {
        riderId: rider.id,
        periodStart: new Date(Date.now() - 864e5).toISOString(),
        periodEnd: new Date(Date.now() + 864e5).toISOString()
      }
    });

    expect(settled.status).toBe(200);
    expect(settled.body.orderCount).toBe(1);
    // 25% of the 150.0000 fee — the settlement row comes back typed.
    expect(settled.body.amount).toBe('37.5000');
  });
});
