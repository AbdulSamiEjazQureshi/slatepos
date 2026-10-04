import type { AppConfig } from '@roms/config';
import type { Db } from '@roms/database';
import type { Cache } from '../infrastructure/cache';
import type { EmailProvider } from '../infrastructure/email';
import type { Logger } from '../infrastructure/logger';
import type { RealtimeHub } from '../infrastructure/realtime';

/**
 * Explicit application dependencies, created once at boot and injected into the
 * Elysia composition. This keeps feature modules free of global singletons and
 * makes them straightforward to test with in-memory substitutes.
 */
export type AppDeps = {
  readonly config: AppConfig;
  readonly db: Db;
  readonly logger: Logger;
  readonly cache: Cache;
  readonly realtime: RealtimeHub;
  readonly email: EmailProvider;
};
