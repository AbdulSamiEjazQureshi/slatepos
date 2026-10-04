import { eq } from 'drizzle-orm';
import { loadConfig, loadNearestEnv, resolveFromEnvRoot } from '@roms/config';
import { ROLE_PERMISSIONS } from '@roms/contracts/permissions';
import type { Role } from '@roms/contracts/enums';
import { createDatabase, type Db } from './client';
import {
  accounts,
  branches,
  categories,
  customers,
  departments,
  employees,
  floors,
  kitchenStations,
  modifierGroups,
  modifierOptions,
  productModifierGroups,
  products,
  restaurantTables,
  roles as rolesTable,
  stockLevels,
  suppliers,
  tenants,
  userBranches,
  userRoles,
  users,
  websiteSettings
} from './schema';

const DEMO_TENANT_SLUG = 'demo';
const PASSWORD = 'Password123';

const hash = (password: string): Promise<string> =>
  Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 19_456, timeCost: 2 });

const SYSTEM_ROLES: Role[] = [
  'TENANT_OWNER',
  'BRANCH_MANAGER',
  'CASHIER',
  'KITCHEN_STAFF',
  'INVENTORY_MANAGER',
  'ACCOUNTANT'
];

const seedRoles = async (db: Db, tenantId: string): Promise<Map<string, string>> => {
  const rows = await db
    .insert(rolesTable)
    .values(
      SYSTEM_ROLES.map((role) => ({
        tenantId,
        name: role,
        isSystem: true,
        permissions: [...ROLE_PERMISSIONS[role]]
      }))
    )
    .returning({ id: rolesTable.id, name: rolesTable.name });
  return new Map(rows.map((row) => [row.name, row.id]));
};

const seedUsers = async (
  db: Db,
  tenantId: string,
  branchIds: string[],
  roleIds: Map<string, string>
): Promise<void> => {
  const passwordHash = await hash(PASSWORD);

  await db.insert(users).values({
    tenantId: null,
    email: 'admin@roms.test',
    passwordHash,
    fullName: 'Platform Admin',
    isPlatformAdmin: true,
    emailVerifiedAt: new Date()
  });

  const seedList = [
    { email: 'owner@demo.test', fullName: 'Demo Owner', role: 'TENANT_OWNER' },
    { email: 'manager@demo.test', fullName: 'Demo Manager', role: 'BRANCH_MANAGER' },
    { email: 'cashier@demo.test', fullName: 'Demo Cashier', role: 'CASHIER' }
  ];

  for (const entry of seedList) {
    const inserted = await db
      .insert(users)
      .values({
        tenantId,
        email: entry.email,
        passwordHash,
        fullName: entry.fullName,
        emailVerifiedAt: new Date()
      })
      .returning({ id: users.id });
    const user = inserted[0];
    if (!user) continue;
    const roleId = roleIds.get(entry.role);
    if (roleId) await db.insert(userRoles).values({ userId: user.id, roleId });
    if (branchIds.length > 0) {
      await db
        .insert(userBranches)
        .values(branchIds.map((branchId) => ({ userId: user.id, branchId })));
    }
  }
};

const seedCatalog = async (db: Db, tenantId: string, branchIds: string[]): Promise<void> => {
  const categoryRows = await db
    .insert(categories)
    .values([
      { tenantId, name: 'Starters', sortOrder: 1 },
      { tenantId, name: 'Mains', sortOrder: 2 },
      { tenantId, name: 'Drinks', sortOrder: 3 },
      { tenantId, name: 'Desserts', sortOrder: 4 }
    ])
    .returning({ id: categories.id, name: categories.name });
  const byName = new Map(categoryRows.map((row) => [row.name, row.id]));

  const extras = await db
    .insert(modifierGroups)
    .values({ tenantId, name: 'Extras', minSelect: 0, maxSelect: 3 })
    .returning({ id: modifierGroups.id });
  const extrasGroup = extras[0];

  if (extrasGroup) {
    await db.insert(modifierOptions).values([
      { groupId: extrasGroup.id, name: 'Extra Cheese', priceDelta: '80', sortOrder: 1 },
      { groupId: extrasGroup.id, name: 'Bacon', priceDelta: '120', sortOrder: 2 },
      { groupId: extrasGroup.id, name: 'Extra Sauce', priceDelta: '40', sortOrder: 3 }
    ]);
  }

  const productRows = await db
    .insert(products)
    .values([
      {
        tenantId,
        categoryId: byName.get('Starters') ?? null,
        name: 'Loaded Fries',
        sku: 'STR-001',
        barcode: '1000000000017',
        aliases: ['fries', 'chips'],
        price: '350',
        costPrice: '120',
        taxRate: '0.05',
        trackInventory: true
      },
      {
        tenantId,
        categoryId: byName.get('Mains') ?? null,
        name: 'Chicken Burger',
        sku: 'MNS-001',
        barcode: '1000000000024',
        aliases: ['burger', 'chicken burger'],
        price: '650',
        costPrice: '280',
        taxRate: '0.05',
        trackInventory: true
      },
      {
        tenantId,
        categoryId: byName.get('Mains') ?? null,
        name: 'Beef Steak',
        sku: 'MNS-002',
        price: '1450',
        costPrice: '720',
        taxRate: '0.05'
      },
      {
        tenantId,
        categoryId: byName.get('Drinks') ?? null,
        name: 'Cola 500ml',
        sku: 'DRK-001',
        barcode: '1000000000031',
        price: '150',
        costPrice: '60',
        taxRate: '0.16',
        trackInventory: true
      },
      {
        tenantId,
        categoryId: byName.get('Desserts') ?? null,
        name: 'Chocolate Lava Cake',
        sku: 'DST-001',
        price: '450',
        costPrice: '160',
        taxRate: '0.05'
      }
    ])
    .returning({ id: products.id, sku: products.sku });

  if (extrasGroup) {
    const linked = ['MNS-001', 'STR-001']
      .map((sku) => productRows.find((row) => row.sku === sku))
      .filter((row): row is { id: string; sku: string | null } => Boolean(row))
      .map((row) => ({ productId: row.id, groupId: extrasGroup.id }));
    if (linked.length > 0) await db.insert(productModifierGroups).values(linked);
  }

  const mainBranch = branchIds[0];
  if (mainBranch) {
    const tracked = productRows.filter(
      (row) => row.sku === 'STR-001' || row.sku === 'MNS-001' || row.sku === 'DRK-001'
    );
    await db.insert(stockLevels).values(
      tracked.map((row, index) => ({
        tenantId,
        branchId: mainBranch,
        productId: row.id,
        quantity: [120, 80, 300][index] ?? 50,
        reorderPoint: 20
      }))
    );
  }
};

const seedFloorAndTables = async (db: Db, tenantId: string, branchIds: string[]): Promise<void> => {
  for (const branchId of branchIds) {
    const inserted = await db
      .insert(floors)
      .values({ tenantId, branchId, name: 'Main Hall', sortOrder: 1 })
      .returning({ id: floors.id });
    const floor = inserted[0];
    if (!floor) continue;
    await db.insert(restaurantTables).values(
      Array.from({ length: 8 }, (_, index) => ({
        tenantId,
        branchId,
        floorId: floor.id,
        name: `T${index + 1}`,
        capacity: index % 2 === 0 ? 4 : 2,
        positionX: (index % 4) * 120,
        positionY: Math.floor(index / 4) * 120
      }))
    );
  }
};

const seedCustomers = async (db: Db, tenantId: string): Promise<void> => {
  await db.insert(customers).values([
    { tenantId, name: 'Ali Raza', phone: '03001234567', email: 'ali@example.com' },
    { tenantId, name: 'Sara Khan', phone: '03007654321' }
  ]);
};

const seedOperations = async (db: Db, tenantId: string, branchIds: string[]): Promise<void> => {
  const mainBranch = branchIds[0];
  await db.insert(suppliers).values([
    {
      tenantId,
      name: 'Fresh Foods Co',
      contactName: 'Bilal',
      phone: '042111222333',
      paymentTerms: 15
    },
    {
      tenantId,
      name: 'Metro Beverages',
      contactName: 'Hina',
      phone: '042111444555',
      paymentTerms: 7
    }
  ]);

  if (mainBranch) {
    await db.insert(kitchenStations).values([
      { tenantId, branchId: mainBranch, name: 'Grill' },
      { tenantId, branchId: mainBranch, name: 'Cold Station' }
    ]);
  }

  const deptRows = await db
    .insert(departments)
    .values([
      { tenantId, name: 'Kitchen' },
      { tenantId, name: 'Front of House' }
    ])
    .returning({ id: departments.id, name: departments.name });
  const kitchenDept = deptRows.find((row) => row.name === 'Kitchen')?.id ?? null;
  await db.insert(employees).values([
    {
      tenantId,
      branchId: mainBranch ?? null,
      departmentId: kitchenDept,
      fullName: 'Usman Chef',
      position: 'Head Chef',
      salaryAmount: '120000',
      salaryType: 'MONTHLY'
    },
    {
      tenantId,
      branchId: mainBranch ?? null,
      fullName: 'Ayesha Server',
      position: 'Waiter',
      salaryAmount: '45000',
      salaryType: 'MONTHLY',
      commissionRate: '0.01'
    }
  ]);

  await db.insert(accounts).values([
    { tenantId, code: '1000', name: 'Cash', type: 'ASSET' },
    { tenantId, code: '1010', name: 'Bank', type: 'ASSET' },
    { tenantId, code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
    { tenantId, code: '2100', name: 'Tax Payable', type: 'LIABILITY' },
    { tenantId, code: '4000', name: 'Sales', type: 'INCOME' },
    { tenantId, code: '5100', name: 'Operating Expenses', type: 'EXPENSE' }
  ]);

  await db.insert(websiteSettings).values({
    tenantId,
    slug: 'demo-bistro',
    isPublished: true,
    brand: { logoUrl: null, primaryColor: '#111827', accentColor: '#f59e0b', fontFamily: 'Inter' },
    seoTitle: 'Demo Bistro — Order Online',
    sections: [
      { type: 'hero', variant: 'split', title: 'Fresh food, delivered fast', theme: 'dark' },
      { type: 'categories', title: 'Browse the menu' },
      { type: 'products', title: 'Popular right now', limit: 8 }
    ]
  });
};

const run = async (): Promise<void> => {
  const envPath = loadNearestEnv();
  const config = loadConfig();
  const client = await createDatabase(
    config.database.driver === 'postgres'
      ? { driver: 'postgres', url: config.database.url ?? '' }
      : { driver: 'pglite', dir: resolveFromEnvRoot(config.database.pgliteDir, envPath) }
  );
  const { db } = client;

  try {
    const existing = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, DEMO_TENANT_SLUG));

    if (existing.length > 0) {
      console.log('ℹ Demo tenant already exists; nothing to seed.');
      return;
    }

    const tenantRows = await db
      .insert(tenants)
      .values({
        name: 'Demo Bistro',
        slug: DEMO_TENANT_SLUG,
        legalName: 'Demo Bistro (Pvt) Ltd',
        settings: {
          currency: 'PKR',
          timezone: 'Asia/Karachi',
          locale: 'en-PK',
          taxRules: [{ name: 'GST', rate: '0.05', inclusive: false, appliesTo: 'ALL' }],
          serviceChargeRate: '0',
          receiptFooter: 'Thank you for dining with us!',
          orderPrefix: 'DB'
        }
      })
      .returning({ id: tenants.id });
    const tenant = tenantRows[0];
    if (!tenant) throw new Error('Failed to create demo tenant');

    const branchRows = await db
      .insert(branches)
      .values([
        {
          tenantId: tenant.id,
          name: 'Main Branch',
          code: 'MAIN',
          address: '12 Food Street, Lahore',
          isDefault: true
        },
        { tenantId: tenant.id, name: 'Downtown', code: 'DTWN', address: '5 Mall Road, Lahore' }
      ])
      .returning({ id: branches.id });
    const branchIds = branchRows.map((row) => row.id);

    const roleIds = await seedRoles(db, tenant.id);
    await seedUsers(db, tenant.id, branchIds, roleIds);
    await seedCatalog(db, tenant.id, branchIds);
    await seedFloorAndTables(db, tenant.id, branchIds);
    await seedCustomers(db, tenant.id);
    await seedOperations(db, tenant.id, branchIds);

    console.log('✔ Seed complete');
    console.log('  Tenant: demo  |  Branches: MAIN, DTWN');
    console.log('  Users: admin@roms.test, owner@demo.test, manager@demo.test, cashier@demo.test');
    console.log(`  Password for all seeded users: ${PASSWORD}`);
  } finally {
    await client.close();
  }
};

await run();
