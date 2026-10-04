import { Elysia } from 'elysia';
import { sql } from '@roms/database';
import type { AppDeps } from '../../app/deps';
import { corePlugin } from '../../plugins/core';

/** Liveness and readiness probes. */
export const healthModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1', tags: ['health'] })
    .use(corePlugin(deps))
    .get('/health/live', () => ({ status: 'ok', time: new Date().toISOString() }), {
      detail: { summary: 'Liveness probe' }
    })
    .get(
      '/health/ready',
      async ({ db }) => {
        await db.execute(sql`select 1`);
        return { status: 'ready', driver: deps.config.database.driver };
      },
      { detail: { summary: 'Readiness probe (checks the database)' } }
    );
