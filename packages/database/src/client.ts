import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { acquirePgliteLock } from './pglite-lock';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * The query builder surface is identical across the two drivers, so we expose
 * one `Db` type for application code.
 */
export type Db = PostgresJsDatabase<typeof schema>;

export type DatabaseClient = {
  readonly db: Db;
  readonly driver: 'pglite' | 'postgres';
  readonly close: () => Promise<void>;
};

export type PgliteDatabaseOptions = {
  driver: 'pglite';
  /** Directory for on-disk storage. Ignored when `memory` is true. */
  dir?: string;
  memory?: boolean;
};

export type PostgresDatabaseOptions = {
  driver: 'postgres';
  url: string;
  max?: number;
};

export type CreateDatabaseOptions = PgliteDatabaseOptions | PostgresDatabaseOptions;

export { schema };

/**
 * Create a database client. PGlite runs real PostgreSQL (compiled to WASM) in
 * process — ideal for development, tests and CI without Docker. Production uses
 * a real server through postgres.js.
 */
export const createDatabase = async (options: CreateDatabaseOptions): Promise<DatabaseClient> => {
  if (options.driver === 'postgres') {
    const client = postgres(options.url, {
      max: options.max ?? 10,
      onnotice: () => {}
    });
    const db = drizzlePostgres(client, { schema }) as unknown as Db;
    return {
      db,
      driver: 'postgres',
      close: async () => {
        await client.end({ timeout: 5 });
      }
    };
  }

  const useMemory = options.memory ?? !options.dir;
  if (!useMemory && options.dir) {
    mkdirSync(dirname(options.dir), { recursive: true });
  }
  const release = !useMemory && options.dir ? acquirePgliteLock(resolve(options.dir)) : () => {};
  const pglite = useMemory ? new PGlite() : new PGlite(options.dir);
  try {
    await pglite.waitReady;
  } catch (error) {
    release();
    throw new Error(
      'Embedded database could not start. Preserve the data directory and restore a backup, or use a new PGLITE_DIR for a fresh development database.',
      { cause: error }
    );
  }
  const db = drizzlePglite(pglite, { schema }) as unknown as Db;
  return {
    db,
    driver: 'pglite',
    close: async () => {
      try {
        await pglite.close();
      } finally {
        release();
      }
    }
  };
};
