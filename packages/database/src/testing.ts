import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';
import type { DatabaseClient, Db } from './client';

export type { DatabaseClient, Db };

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * An in-memory PostgreSQL (PGlite) with all migrations applied — real Postgres
 * semantics for tests without Docker. Use in integration tests that need
 * transactions, constraints and concurrency behaviour.
 */
export const createTestDatabase = async (): Promise<DatabaseClient> => {
  const pglite = new PGlite();
  await pglite.waitReady;
  const instance = drizzle(pglite, { schema });
  await migrate(instance, { migrationsFolder });
  return {
    db: instance as unknown as Db,
    driver: 'pglite',
    close: async () => {
      await pglite.close();
    }
  };
};
