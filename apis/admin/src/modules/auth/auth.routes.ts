import { eq, tenants } from '@roms/database';
import { Elysia, t } from 'elysia';
import { z } from 'zod';
import {
  authResultSchema,
  currentUserSchema,
  forgotPasswordSchema,
  loginSchema,
  okResultSchema,
  otpRequestResultSchema,
  refreshTokenSchema,
  registerTenantSchema,
  requestOtpSchema,
  resetPasswordSchema,
  sessionSchema,
  tokenPairSchema,
  verifyOtpSchema,
  type CurrentUser
} from '@roms/contracts/auth';
import type { Permission } from '@roms/contracts/permissions';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { loadPrincipal } from '../../infrastructure/principal';
import { unwrap } from '../../lib/http';
import type { RequestContext } from '../../lib/context';
import { securityPlugin } from '../../plugins/security';
import { requestOtp, verifyOtp } from './auth.otp';
import {
  authenticate,
  getUserContact,
  issueSessionForUser,
  listSessions,
  registerTenant,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  rotateRefreshToken
} from './auth.service';

const refreshCookie = t.Cookie({ refresh_token: t.Optional(t.String()) });
const sessionsSchema = z.array(sessionSchema);

const setRefreshCookie = (
  cookie: { refresh_token?: { set: (options: Record<string, unknown>) => void } },
  deps: AppDeps,
  token: string
): void => {
  cookie.refresh_token?.set({
    value: token,
    httpOnly: true,
    secure: deps.config.isProduction,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: deps.config.auth.refreshTokenTtl
  });
};

export const authModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/auth', tags: ['auth'] })
    .use(securityPlugin(deps))
    .post(
      '/login',
      async ({ body, ctx, cookie }) => {
        const result = unwrap(
          await authenticate(deps, body, { userAgent: ctx.userAgent, ipAddress: ctx.ipAddress })
        );
        setRefreshCookie(cookie, deps, result.tokens.refreshToken);
        return { user: result.user, tokens: result.tokens };
      },
      {
        body: loginSchema,
        cookie: refreshCookie,
        response: { 200: authResultSchema },
        rateLimit: { max: 10, windowSeconds: 60 },
        detail: { summary: 'Sign in with email and password' }
      }
    )
    .post(
      '/register',
      async ({ body, ctx, cookie }) => {
        const result = unwrap(
          await registerTenant(deps, body, { userAgent: ctx.userAgent, ipAddress: ctx.ipAddress })
        );
        setRefreshCookie(cookie, deps, result.tokens.refreshToken);
        return { user: result.user, tokens: result.tokens };
      },
      {
        body: registerTenantSchema,
        cookie: refreshCookie,
        response: { 200: authResultSchema },
        rateLimit: { max: 5, windowSeconds: 60 },
        detail: { summary: 'Create a tenant with its owner account' }
      }
    )
    .post(
      '/refresh',
      async ({ body, ctx, cookie }) => {
        const raw = body.refreshToken ?? cookie.refresh_token?.value;
        if (!raw) throw AppError.unauthorized('No refresh token provided');
        const tokens = unwrap(
          await rotateRefreshToken(deps, raw, {
            userAgent: ctx.userAgent,
            ipAddress: ctx.ipAddress
          })
        );
        if (tokens.refreshToken) setRefreshCookie(cookie, deps, tokens.refreshToken);
        return tokens;
      },
      {
        body: refreshTokenSchema,
        cookie: refreshCookie,
        response: { 200: tokenPairSchema },
        rateLimit: { max: 30, windowSeconds: 60 },
        detail: { summary: 'Rotate a refresh token for a new token pair' }
      }
    )
    .post(
      '/logout',
      async ({ ctx, cookie }) => {
        if (ctx.sessionId) await revokeSession(deps, ctx.sessionId);
        cookie.refresh_token?.remove();
        return { ok: true as const };
      },
      {
        cookie: refreshCookie,
        requireAuth: true,
        response: { 200: okResultSchema },
        detail: { summary: 'Revoke the current session' }
      }
    )
    .get('/me', async ({ ctx }) => buildCurrentUser(deps, ctx), {
      requireAuth: true,
      response: { 200: currentUserSchema },
      detail: { summary: 'The currently authenticated user' }
    })
    .get(
      '/sessions',
      async ({ ctx }) => {
        if (!ctx.userId) return [];
        const rows = await listSessions(deps, ctx.userId);
        return rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          tenantId: row.tenantId,
          userAgent: row.userAgent,
          ipAddress: row.ipAddress,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          revokedAt: row.revokedAt?.toISOString() ?? null
        }));
      },
      {
        requireAuth: true,
        response: { 200: sessionsSchema },
        detail: { summary: 'List active sessions for the current user' }
      }
    )
    .delete(
      '/sessions/:id',
      async ({ ctx, params }) => {
        if (ctx.userId) {
          const rows = await listSessions(deps, ctx.userId);
          if (rows.some((row) => row.id === params.id)) await revokeSession(deps, params.id);
        }
        return { ok: true as const };
      },
      {
        requireAuth: true,
        response: { 200: okResultSchema },
        detail: { summary: 'Revoke a specific session' }
      }
    )
    .post(
      '/password/forgot',
      async ({ body }) => {
        await requestPasswordReset(deps, body.email);
        return { ok: true as const };
      },
      {
        body: forgotPasswordSchema,
        response: { 200: okResultSchema },
        rateLimit: { max: 5, windowSeconds: 300 },
        detail: { summary: 'Request a password reset token by email' }
      }
    )
    .post(
      '/password/reset',
      async ({ body }) => {
        unwrap(await resetPassword(deps, body.token, body.password));
        return { ok: true as const };
      },
      {
        body: resetPasswordSchema,
        response: { 200: okResultSchema },
        rateLimit: { max: 10, windowSeconds: 300 },
        detail: { summary: 'Reset a password using a reset token' }
      }
    )
    .post(
      '/otp/request',
      async ({ body }) => {
        await requestOtp(deps, body.identifier, body.purpose);
        return { sent: true as const };
      },
      {
        body: requestOtpSchema,
        response: { 200: otpRequestResultSchema },
        rateLimit: { max: 5, windowSeconds: 300 },
        detail: { summary: 'Request a one-time passcode' }
      }
    )
    .post(
      '/otp/verify',
      async ({ body, ctx }) => {
        const result = unwrap(await verifyOtp(deps, body.identifier, body.purpose, body.code));
        if (body.purpose !== 'LOGIN' || !result.userId) return { verified: true as const };
        const tokens = unwrap(
          await issueSessionForUser(deps, result.userId, {
            userAgent: ctx.userAgent,
            ipAddress: ctx.ipAddress
          })
        );
        return { verified: true as const, tokens };
      },
      {
        body: verifyOtpSchema,
        rateLimit: { max: 10, windowSeconds: 300 },
        detail: { summary: 'Verify a one-time passcode (LOGIN purpose returns a token pair)' }
      }
    );

const buildCurrentUser = async (deps: AppDeps, ctx: RequestContext): Promise<CurrentUser> => {
  if (!ctx.userId) throw AppError.unauthorized();
  const principal = await loadPrincipal(deps.db, deps.cache, ctx.userId);
  const contact = await getUserContact(deps, ctx.userId);

  let tenantSlug: string | null = null;
  if (ctx.tenantId) {
    const rows = await deps.db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);
    tenantSlug = rows[0]?.slug ?? null;
  }

  return {
    id: ctx.userId,
    email: contact?.email ?? '',
    fullName: contact?.fullName ?? '',
    status: principal?.status ?? 'ACTIVE',
    isPlatformAdmin: ctx.isPlatformAdmin,
    tenantId: ctx.tenantId,
    tenantSlug,
    branchIds: [...(principal?.branchIds ?? [])],
    roles: [...ctx.roles] as CurrentUser['roles'],
    permissions: [...ctx.permissions] as Permission[]
  };
};
