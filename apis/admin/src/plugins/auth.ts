import { Elysia, status } from 'elysia';
import type { Permission } from '@roms/contracts/permissions';
import { ErrorCode } from '@roms/utils';
import type { AppDeps } from '../app/deps';
import type { RequestContext } from '../lib/context';
import { apiError } from '../lib/api-error';
import { verifyJwt } from '../lib/jwt';
import { hasGlobalBranchAccess, loadPrincipal } from '../infrastructure/principal';
import { corePlugin } from './core';

type ElysiaContext = {
  request: Request;
  headers: Record<string, string | undefined>;
  server?: { requestIP?: (request: Request) => { address: string } | null } | null;
};

const resolveIpAddress = (ctx: ElysiaContext): string | null => {
  const forwarded = ctx.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  const realIp = ctx.headers['x-real-ip'];
  if (realIp) return realIp;
  try {
    return ctx.server?.requestIP?.(ctx.request)?.address ?? null;
  } catch {
    return null;
  }
};

const anonymousContext = (
  requestId: string,
  ipAddress: string | null,
  userAgent: string | null
): RequestContext => ({
  requestId,
  userId: null,
  sessionId: null,
  tenantId: null,
  branchId: null,
  isPlatformAdmin: false,
  roles: [],
  permissions: new Set<Permission>(),
  ipAddress,
  userAgent
});

/**
 * Resolves the caller into a `ctx` object and exposes authorization macros.
 * Tenant/branch/user context is always derived here from the token and headers
 * — never from the request body.
 */
export const authPlugin = (deps: AppDeps) =>
  new Elysia({ name: 'auth' })
    .use(corePlugin(deps))
    .derive({ as: 'global' }, async (ctx): Promise<{ ctx: RequestContext }> => {
      const requestId = ctx.headers['x-request-id'] ?? crypto.randomUUID();
      const userAgent = ctx.headers['user-agent'] ?? null;
      const ipAddress = resolveIpAddress(ctx as ElysiaContext);

      const authorization = ctx.headers['authorization'];
      if (!authorization?.startsWith('Bearer ')) {
        return { ctx: anonymousContext(requestId, ipAddress, userAgent) };
      }

      const verified = await verifyJwt(authorization.slice(7), deps.config.auth.jwtSecret);
      if (!verified.valid) {
        return { ctx: anonymousContext(requestId, ipAddress, userAgent) };
      }

      const principal = await loadPrincipal(deps.db, deps.cache, verified.payload.sub);
      if (!principal || principal.status !== 'ACTIVE') {
        return { ctx: anonymousContext(requestId, ipAddress, userAgent) };
      }

      const requestedBranch = ctx.headers['x-branch-id'] ?? null;
      const permittedBranch =
        requestedBranch &&
        (hasGlobalBranchAccess(principal) || principal.branchIds.includes(requestedBranch))
          ? requestedBranch
          : null;

      return {
        ctx: {
          requestId,
          userId: principal.userId,
          sessionId: verified.payload.sid,
          tenantId: principal.tenantId,
          branchId: permittedBranch,
          isPlatformAdmin: principal.isPlatformAdmin,
          roles: principal.roles,
          permissions: principal.permissions,
          ipAddress,
          userAgent
        }
      };
    })
    .macro({
      /** Require a valid access token. */
      requireAuth: {
        resolve({ ctx }: { ctx: RequestContext }) {
          if (!ctx.userId) {
            return status(
              401,
              apiError(ErrorCode.UNAUTHORIZED, 'Authentication required', {
                requestId: ctx.requestId
              })
            );
          }
        }
      },
      /** Require a tenant scope (i.e. a tenant-bound user). */
      requireTenant: {
        resolve({ ctx }: { ctx: RequestContext }) {
          if (!ctx.userId) {
            return status(
              401,
              apiError(ErrorCode.UNAUTHORIZED, 'Authentication required', {
                requestId: ctx.requestId
              })
            );
          }
          if (!ctx.tenantId) {
            return status(
              400,
              apiError(ErrorCode.TENANT_REQUIRED, 'A tenant context is required', {
                requestId: ctx.requestId
              })
            );
          }
        }
      },
      /** Require a specific permission (any-of when given an array). */
      requirePermission: (required: Permission | Permission[]) => ({
        resolve({ ctx }: { ctx: RequestContext }) {
          const list = Array.isArray(required) ? required : [required];
          const allowed = list.some((permission) => ctx.permissions.has(permission));
          if (!allowed) {
            return status(
              403,
              apiError(
                ErrorCode.PERMISSION_DENIED,
                'You do not have permission to perform this action',
                {
                  requestId: ctx.requestId
                }
              )
            );
          }
        }
      }),
      /** Require an authorized branch for the current user. */
      requireBranch: {
        resolve({ ctx }: { ctx: RequestContext }) {
          if (!ctx.branchId) {
            return status(
              400,
              apiError(
                ErrorCode.BRANCH_REQUIRED,
                'An authorized branch is required (x-branch-id)',
                {
                  requestId: ctx.requestId
                }
              )
            );
          }
        }
      }
    });
