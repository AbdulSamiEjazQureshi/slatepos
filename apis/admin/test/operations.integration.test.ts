import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { loadConfig } from '@roms/config';
import {
  branches,
  eq,
  products,
  roles,
  stockLevels,
  suppliers,
  tenants,
  userBranches,
  userRoles,
  users
} from '@roms/database';
import { createTestDatabase, type DatabaseClient } from '@roms/database/testing';
import { toBusinessDate } from '@roms/utils';
import { createApp } from '../src/app';
import type { AppDeps } from '../src/app/deps';
import { createMemoryCache } from '../src/infrastructure/cache';
import { createEmailProvider } from '../src/infrastructure/email';
import { createLogger } from '../src/infrastructure/logger';
import { createRealtimeHub } from '../src/infrastructure/realtime';
import { hashPassword } from '../src/lib/password';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  JWT_SECRET: 'operations-test-secret-0123456789',
  ACCESS_TOKEN_TTL: '900',
  REFRESH_TOKEN_TTL: '2592000',
  DATABASE_DRIVER: 'pglite',
  CORS_ORIGINS: 'http://localhost:5173',
  EMAIL_PROVIDER: 'console'
});

type TenantFixture = {
  tenantId: string;
  branchId: string;
  ownerToken: string;
  productId: string;
  ingredientId: string;
  supplierId: string;
};

let client: DatabaseClient;
let app: ReturnType<typeof createApp>;
let deps: AppDeps;
let a: TenantFixture;
let b: TenantFixture;

const request = async (
  method: string,
  path: string,
  options: { token?: string; body?: unknown; branchId?: string } = {}
): Promise<{ status: number; body: any }> => {
  const headers: Record<string, string> = {};
  if (options.token) headers['authorization'] = `Bearer ${options.token}`;
  if (options.branchId) headers['x-branch-id'] = options.branchId;
  if (options.body) headers['content-type'] = 'application/json';
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    })
  );
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

const seedTenant = async (label: string, slug: string, email: string): Promise<TenantFixture> => {
  const passwordHash = await hashPassword('Password123');
  const tenant = (
    await deps.db.insert(tenants).values({ name: label, slug }).returning({ id: tenants.id })
  )[0]!;
  const branch = (
    await deps.db
      .insert(branches)
      .values({ tenantId: tenant.id, name: 'Main', code: 'MAIN', isDefault: true })
      .returning({ id: branches.id })
  )[0]!;
  const role = (
    await deps.db
      .insert(roles)
      .values({ tenantId: tenant.id, name: 'TENANT_OWNER', isSystem: true, permissions: ['*'] })
      .returning({ id: roles.id })
  )[0]!;
  const user = (
    await deps.db
      .insert(users)
      .values({ tenantId: tenant.id, email, passwordHash, fullName: 'Owner' })
      .returning({ id: users.id })
  )[0]!;
  await deps.db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  await deps.db.insert(userBranches).values({ userId: user.id, branchId: branch.id });

  const product = (
    await deps.db
      .insert(products)
      .values({
        tenantId: tenant.id,
        name: 'Burger',
        sku: `${slug}-BURGER`,
        price: '500',
        taxRate: '0.05',
        trackInventory: true
      })
      .returning({ id: products.id })
  )[0]!;
  const ingredient = (
    await deps.db
      .insert(products)
      .values({
        tenantId: tenant.id,
        name: 'Patty',
        sku: `${slug}-PATTY`,
        price: '120',
        costPrice: '120',
        trackInventory: true
      })
      .returning({ id: products.id })
  )[0]!;
  await deps.db.insert(stockLevels).values([
    {
      tenantId: tenant.id,
      branchId: branch.id,
      productId: product.id,
      quantity: 10,
      reorderPoint: 2
    },
    {
      tenantId: tenant.id,
      branchId: branch.id,
      productId: ingredient.id,
      quantity: 0,
      reorderPoint: 5
    }
  ]);
  const supplier = (
    await deps.db
      .insert(suppliers)
      .values({ tenantId: tenant.id, name: `${label} Supplier` })
      .returning({ id: suppliers.id })
  )[0]!;

  const login = await request('POST', '/api/v1/auth/login', {
    body: { email, password: 'Password123' }
  });
  return {
    tenantId: tenant.id,
    branchId: branch.id,
    ownerToken: login.body.tokens.accessToken,
    productId: product.id,
    ingredientId: ingredient.id,
    supplierId: supplier.id
  };
};

beforeAll(async () => {
  client = await createTestDatabase();
  deps = {
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
  app = createApp(deps);
  a = await seedTenant('Tenant A', 'ops-a', 'ops-a@test.dev');
  b = await seedTenant('Tenant B', 'ops-b', 'ops-b@test.dev');
}, 90_000);

afterAll(async () => {
  await client?.close();
});

describe('purchasing → inventory', () => {
  let purchaseOrderItemId = '';

  test('creates and receives a purchase order, moving stock and posting payable', async () => {
    const created = await request('POST', '/api/v1/purchasing/purchase-orders', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: {
        supplierId: a.supplierId,
        branchId: a.branchId,
        items: [{ productId: a.ingredientId, quantity: 50, unitCost: '10' }]
      }
    });
    expect(created.status).toBe(200);
    expect(created.body.total).toBe('500.0000');
    purchaseOrderItemId = created.body.items[0].id;

    await request('POST', `/api/v1/purchasing/purchase-orders/${created.body.id}/status`, {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { status: 'ORDERED' }
    });

    const received = await request(
      'POST',
      `/api/v1/purchasing/purchase-orders/${created.body.id}/receive`,
      {
        token: a.ownerToken,
        branchId: a.branchId,
        body: { items: [{ purchaseOrderItemId, quantity: 50 }] }
      }
    );
    expect(received.status).toBe(200);
    expect(received.body.items).toHaveLength(1);

    const levels = await deps.db
      .select()
      .from(stockLevels)
      .where(eq(stockLevels.productId, a.ingredientId));
    expect(levels[0]?.quantity).toBe(50);

    const ledger = await request('GET', `/api/v1/purchasing/suppliers/${a.supplierId}/ledger`, {
      token: a.ownerToken,
      branchId: a.branchId
    });
    expect(ledger.body.balance).toBe('500.0000');
  });

  test('supplier payment reduces the payable balance', async () => {
    await request('POST', '/api/v1/purchasing/suppliers/payments', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { supplierId: a.supplierId, amount: '200', idempotencyKey: 'ops-pay-1' }
    });
    const ledger = await request('GET', `/api/v1/purchasing/suppliers/${a.supplierId}/ledger`, {
      token: a.ownerToken,
      branchId: a.branchId
    });
    expect(ledger.body.balance).toBe('300.0000');
  });

  test('isolates suppliers between tenants', async () => {
    const list = await request('GET', '/api/v1/purchasing/suppliers', {
      token: b.ownerToken,
      branchId: b.branchId
    });
    expect(list.status).toBe(200);
    expect(list.body.items.map((s: { id: string }) => s.id)).not.toContain(a.supplierId);
  });
});

describe('recipes & production', () => {
  test('produces a batch, consuming ingredients and producing output', async () => {
    const recipe = await request('POST', '/api/v1/recipes', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: {
        productId: a.productId,
        name: 'Burger build',
        items: [{ componentProductId: a.ingredientId, quantity: '1', unitCost: '10' }]
      }
    });
    expect(recipe.status).toBe(200);
    expect(recipe.body.theoreticalCost).toBe('10.0000');

    await request('POST', `/api/v1/recipes/${recipe.body.id}/status`, {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { status: 'ACTIVE' }
    });

    const produced = await request('POST', `/api/v1/recipes/${recipe.body.id}/produce`, {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { quantity: 2, branchId: a.branchId }
    });
    expect(produced.status).toBe(200);
    expect(produced.body.status).toBe('COMPLETED');

    const levels = await deps.db
      .select()
      .from(stockLevels)
      .where(eq(stockLevels.productId, a.ingredientId));
    // 50 received − 2 consumed
    expect(levels[0]?.quantity).toBe(48);
    const output = await deps.db
      .select()
      .from(stockLevels)
      .where(eq(stockLevels.productId, a.productId));
    expect(output[0]?.quantity).toBe(12);
  });
});

describe('kitchen / KDS', () => {
  test('order confirmation creates a kitchen ticket that can be advanced', async () => {
    const order = await request('POST', '/api/v1/orders', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: {
        type: 'DINE_IN',
        tip: '0',
        items: [{ productId: a.productId, quantity: 1, modifiers: [] }]
      }
    });
    await request('POST', `/api/v1/orders/${order.body.id}/status`, {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { status: 'CONFIRMED' }
    });

    const tickets = await request('GET', `/api/v1/kitchen/tickets?branchId=${a.branchId}`, {
      token: a.ownerToken,
      branchId: a.branchId
    });
    expect(tickets.status).toBe(200);
    expect(tickets.body.length).toBeGreaterThan(0);
    const ticket = tickets.body[0];

    const preparing = await request('POST', `/api/v1/kitchen/tickets/${ticket.ticket.id}/status`, {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { status: 'PREPARING' }
    });
    expect(preparing.body.status).toBe('PREPARING');
  });
});

describe('accounting', () => {
  test('produces a daily closing with aggregated sales', async () => {
    const businessDate = toBusinessDate(new Date(), 'Asia/Karachi');
    const closing = await request('POST', '/api/v1/accounting/daily-closing', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { branchId: a.branchId, businessDate }
    });
    expect(closing.status).toBe(200);
    expect(Number(closing.body.netSales)).toBeGreaterThan(0);
    expect(Number(closing.body.orderCount)).toBeGreaterThan(0);
  });

  test('records an expense and posts a journal entry', async () => {
    const expense = await request('POST', '/api/v1/accounting/expenses', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: {
        category: 'Utilities',
        amount: '5000',
        expenseDate: toBusinessDate(new Date(), 'Asia/Karachi')
      }
    });
    expect(expense.status).toBe(200);

    const journal = await request('GET', '/api/v1/accounting/journal', {
      token: a.ownerToken,
      branchId: a.branchId
    });
    expect(journal.status).toBe(200);
    expect(journal.body.length).toBeGreaterThan(0);
  });
});

describe('AI tools', () => {
  test('answers with an authorized tool result (no raw SQL)', async () => {
    const tools = await request('GET', '/api/v1/ai/tools', {
      token: a.ownerToken,
      branchId: a.branchId
    });
    expect(tools.status).toBe(200);
    expect(tools.body.map((t: { name: string }) => t.name)).toContain('get_sales_summary');

    const answer = await request('POST', '/api/v1/ai/query', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: { message: 'How are my sales this month?' }
    });
    expect(answer.status).toBe(200);
    expect(answer.body.tool.name).toBe('get_sales_summary');
    expect(answer.body.tool.result).toBeTruthy();
  });
});

describe('public online ordering', () => {
  test('publishes a site and exposes the public menu', async () => {
    const updated = await request('PATCH', '/api/v1/website/settings', {
      token: a.ownerToken,
      branchId: a.branchId,
      body: {
        slug: 'ops-a-site',
        isPublished: true,
        sections: [{ type: 'hero', variant: 'split', title: 'Welcome', theme: 'dark' }]
      }
    });
    expect(updated.status).toBe(200);

    const site = await request('GET', '/api/v1/public/site/ops-a-site');
    expect(site.status).toBe(200);
    expect(site.body.sections).toHaveLength(1);

    const menu = await request('GET', '/api/v1/public/site/ops-a-site/menu');
    expect(menu.status).toBe(200);
    expect(menu.body.products.length).toBeGreaterThan(0);
  });

  test('places a public order without authentication', async () => {
    const order = await request('POST', '/api/v1/public/site/ops-a-site/orders', {
      body: { tip: '0', items: [{ productId: a.productId, quantity: 1, modifiers: [] }] }
    });
    expect(order.status).toBe(200);
    expect(order.body.type).toBe('ONLINE');
    expect(order.body.tenantId).toBe(a.tenantId);
  });
});
