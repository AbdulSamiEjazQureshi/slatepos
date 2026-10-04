import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { tenants } from './schema';
import { createTestDatabase } from './testing';

describe('database', () => {
  test('migrations produce a queryable schema on real Postgres', async () => {
    const client = await createTestDatabase();
    try {
      const inserted = await client.db
        .insert(tenants)
        .values({ name: 'Smoke Tenant', slug: 'smoke' })
        .returning({ id: tenants.id, slug: tenants.slug });
      expect(inserted[0]?.id).toBeTruthy();

      const found = await client.db.select().from(tenants).where(eq(tenants.slug, 'smoke'));
      expect(found).toHaveLength(1);

      // Unique constraint on slug is enforced by PostgreSQL.
      const duplicate = Promise.resolve(
        client.db.insert(tenants).values({ name: 'Other', slug: 'smoke' })
      );
      await expect(duplicate).rejects.toThrow();
    } finally {
      await client.close();
    }
  }, 60_000);
});
