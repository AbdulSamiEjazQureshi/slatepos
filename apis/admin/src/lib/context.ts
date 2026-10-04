import type { Permission } from '@roms/contracts/permissions';
import { AppError } from '@roms/utils';

/**
 * Everything a feature function needs to know about the caller. Resolved
 * server-side from the access token — never trusted from request bodies.
 */
export type RequestContext = {
  readonly requestId: string;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly tenantId: string | null;
  readonly branchId: string | null;
  readonly isPlatformAdmin: boolean;
  readonly roles: readonly string[];
  readonly permissions: ReadonlySet<Permission>;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

/** A context guaranteed to have a tenant (after `requireTenant`). */
export type TenantContext = RequestContext & {
  readonly tenantId: string;
  readonly userId: string;
};

export const isAuthenticated = (ctx: RequestContext): ctx is RequestContext & { userId: string } =>
  ctx.userId !== null;

/** Narrow a context to a concrete tenant id, or fail with a domain error. */
export const requireTenantId = (ctx: RequestContext): string => {
  if (!ctx.tenantId)
    throw AppError.unprocessable('tenant_required', 'A tenant context is required');
  return ctx.tenantId;
};

/** Narrow a context to a concrete, authorized branch id. */
export const requireBranchId = (ctx: RequestContext): string => {
  if (!ctx.branchId) {
    throw AppError.unprocessable(
      'branch_required',
      'An authorized branch is required (x-branch-id)'
    );
  }
  return ctx.branchId;
};

/** Narrow a context to an authenticated user id. */
export const requireUserId = (ctx: RequestContext): string => {
  if (!ctx.userId) throw AppError.unauthorized();
  return ctx.userId;
};
