import { mkdirSync } from 'node:fs';
import { acquirePgliteLock } from './pglite-lock';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadConfig, loadNearestEnv, resolveFromEnvRoot } from '@roms/config';
import * as schema from './schema';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

const run = async (): Promise<void> => {
  const envPath = loadNearestEnv();
  const config = loadConfig();

  if (config.database.driver === 'postgres') {
    const url = config.database.url;
    if (!url) throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres');
    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await migratePostgres(drizzlePostgres(client, { schema }), { migrationsFolder });
    } finally {
      await client.end({ timeout: 5 });
    }
    console.log(`✔ Migrations applied (postgres)`);
    return;
  }

  const pgliteDir = resolveFromEnvRoot(config.database.pgliteDir, envPath);
  mkdirSync(dirname(pgliteDir), { recursive: true });
  const release = acquirePgliteLock(pgliteDir);
  const pglite = new PGlite(pgliteDir);
  await pglite.waitReady;
  try {
    await migratePglite(drizzlePglite(pglite, { schema }), { migrationsFolder });
  } finally {
    try {
      await pglite.close();
    } finally {
      release();
    }
  }
  console.log(`✔ Migrations applied (pglite: ${pgliteDir})`);
};

await run();
