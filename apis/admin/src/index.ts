import { loadConfig, loadNearestEnv, resolveFromEnvRoot } from '@roms/config';
import { createDatabase } from '@roms/database';
import { createApp } from './app';
import type { AppDeps } from './app/deps';
import { createMemoryCache } from './infrastructure/cache';
import { createEmailProvider } from './infrastructure/email';
import { createLogger } from './infrastructure/logger';
import { createRealtimeHub } from './infrastructure/realtime';

const envPath = loadNearestEnv();
const config = loadConfig();
const logger = createLogger(config);

if (config.database.driver === 'postgres' && !config.database.url) {
  logger.error('DATABASE_URL is required when DATABASE_DRIVER=postgres');
  process.exit(1);
}

const client = await createDatabase(
  config.database.driver === 'postgres'
    ? { driver: 'postgres', url: config.database.url ?? '' }
    : { driver: 'pglite', dir: resolveFromEnvRoot(config.database.pgliteDir, envPath) }
);

const deps: AppDeps = {
  config,
  db: client.db,
  logger,
  cache: createMemoryCache(),
  realtime: createRealtimeHub(),
  email: createEmailProvider(
    {
      provider: config.email.provider,
      ...(config.email.key ? { apiKey: config.email.key } : {}),
      from: config.email.from
    },
    logger
  )
};

const app = createApp(deps).listen({ port: config.api.port, hostname: config.api.host });

logger.info(
  {
    port: config.api.port,
    host: config.api.host,
    env: config.env,
    database: client.driver,
    docs: `http://localhost:${config.api.port}/api/openapi`
  },
  'ROMS API listening'
);

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Shutting down');
  // Drain HTTP work, then close long-lived WebSockets so shutdown can checkpoint.
  const timeout = setTimeout(() => {
    void app.stop(true);
  }, 10_000);
  timeout.unref();
  try {
    await app.stop();
    await client.close();
  } finally {
    clearTimeout(timeout);
  }
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

export type App = typeof app;
