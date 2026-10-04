import { Elysia } from 'elysia';
import type { AppDeps } from '../app/deps';

/**
 * Decorates the request context with the injected dependencies. Named plugins
 * are deduplicated by Elysia, so feature modules can safely `.use(corePlugin)`
 * without creating duplicate state.
 */
export const corePlugin = (deps: AppDeps) =>
  new Elysia({ name: 'core' }).decorate({
    config: deps.config,
    db: deps.db,
    logger: deps.logger,
    cache: deps.cache,
    realtime: deps.realtime,
    email: deps.email
  });
