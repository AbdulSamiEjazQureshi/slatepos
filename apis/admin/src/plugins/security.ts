import { cors } from '@elysia/cors';
import { Elysia, status } from 'elysia';
import { ErrorCode } from '@roms/utils';
import type { AppDeps } from '../app/deps';
import { apiError } from '../lib/api-error';
import type { RequestContext } from '../lib/context';
import { corePlugin } from './core';
import { authPlugin } from './auth';

const SECURE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-xss-protection': '0',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()'
};

type RateLimitOptions = {
  max: number;
  windowSeconds: number;
  /** Scope the counter by something other than IP (e.g. the account email). */
  key?: (ctx: RateLimitContext) => string;
};

type RateLimitContext = {
  ctx: RequestContext;
  request: Request;
  body?: unknown;
};

type WindowEntry = { count: number; resetAt: number };

const consume = async (
  deps: AppDeps,
  key: string,
  max: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfter: number }> => {
  const now = Date.now();
  const entry = await deps.cache.get<WindowEntry>(key);
  if (!entry || entry.resetAt <= now) {
    await deps.cache.set(key, { count: 1, resetAt: now + windowSeconds * 1000 }, windowSeconds);
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  const ttl = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  await deps.cache.set(key, { count: entry.count + 1, resetAt: entry.resetAt }, ttl);
  return { allowed: true, retryAfter: 0 };
};

/** CORS, secure headers and a per-endpoint rate-limit macro. */
export const securityPlugin = (deps: AppDeps) =>
  new Elysia({ name: 'security' })
    .use(corePlugin(deps))
    .use(authPlugin(deps))
    .use(
      cors({
        origin: deps.config.api.corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'x-branch-id',
          'x-request-id',
          'x-tenant-id'
        ]
      })
    )
    .onAfterHandle({ as: 'global' }, ({ set }) => {
      for (const [key, value] of Object.entries(SECURE_HEADERS)) set.headers[key] = value;
    })
    .macro({
      rateLimit: (options: RateLimitOptions) => ({
        async resolve(context: RateLimitContext) {
          const identity = options.key
            ? options.key(context)
            : (context.ctx.ipAddress ?? 'unknown');
          const route = new URL(context.request.url).pathname;
          const result = await consume(
            deps,
            `ratelimit:${route}:${identity}`,
            options.max,
            options.windowSeconds
          );
          if (!result.allowed) {
            return status(
              429,
              apiError(ErrorCode.RATE_LIMITED, 'Too many requests, please slow down', {
                requestId: context.ctx.requestId
              })
            );
          }
        }
      })
    });
