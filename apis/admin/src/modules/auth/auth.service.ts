import { and, eq, gt, isNull } from '@roms/database';
import {
  branches,
  roles as rolesTable,
  sessions,
  tenants,
  userBranches,
  userRoles,
  users,
  verificationTokens,
  type Db
} from '@roms/database';
import { ROLE_PERMISSIONS } from '@roms/contracts/permissions';
import type { Role } from '@roms/contracts/enums';
import type { LoginInput, RegisterTenantInput } from '@roms/contracts/auth';
import { DEFAULT_TENANT_SETTINGS } from '@roms/contracts/settings';
import { AppError, err, ok, type Result } from '@roms/utils';
import { addSeconds, slugify } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { hashPassword, verifyPassword } from '../../lib/password';
import { issueRefreshToken, hashRefreshToken, sha256Hex } from '../../lib/tokens';
import { signJwt } from '../../lib/jwt';
import { invalidatePrincipal } from '../../infrastructure/principal';

export type SessionMeta = { userAgent: string | null; ipAddress: string | null };

export type TokenPair = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  roles: string[];
};

export type AuthResult = { tokens: TokenPair; user: AuthenticatedUser };

const SYSTEM_ROLE_NAMES: Role[] = [
  'TENANT_OWNER',
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'CASHIER',
  'KITCHEN_STAFF',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
  'DELIVERY_MANAGER',
  'STAFF_MANAGER'
];

const loadRoleNames = async (db: Db, userId: string): Promise<string[]> => {
  const rows = await db
    .select({ name: rolesTable.name })
    .from(userRoles)
    .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.name);
};

const issueTokens = async (
  deps: AppDeps,
  user: AuthenticatedUser,
  meta: SessionMeta
): Promise<TokenPair> => {
  const { token: refreshToken, hash } = await issueRefreshToken();
  const expiresAt = addSeconds(new Date(), deps.config.auth.refreshTokenTtl);

  const inserted = await deps.db
    .insert(sessions)
    .values({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: hash,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt
    })
    .returning({ id: sessions.id });

  const session = inserted[0];
  if (!session) throw new Error('Failed to create session');

  const { token: accessToken, expiresIn } = await signJwt(
    {
      subject: user.id,
      sessionId: session.id,
      tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
      roles: user.roles
    },
    deps.config.auth.jwtSecret,
    deps.config.auth.accessTokenTtl
  );

  return { accessToken, tokenType: 'Bearer', expiresIn, refreshToken };
};

export const authenticate = async (
  deps: AppDeps,
  input: LoginInput,
  meta: SessionMeta
): Promise<Result<AuthResult, AppError>> => {
  const rows = await deps.db.select().from(users).where(eq(users.email, input.email)).limit(1);

  const user = rows[0];
  if (!user) {
    // Constant-ish work factor to reduce user enumeration via timing.
    await verifyPassword(input.password, '$argon2id$v=19$m=19456,t=2,p=1$invalid$invalid');
    return err(
      new AppError({
        code: 'invalid_credentials',
        message: 'Invalid email or password',
        status: 401
      })
    );
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    return err(
      new AppError({
        code: 'invalid_credentials',
        message: 'Invalid email or password',
        status: 401
      })
    );
  }

  if (user.status !== 'ACTIVE') {
    return err(
      new AppError({ code: 'account_disabled', message: 'This account is not active', status: 403 })
    );
  }

  if (input.tenantSlug && user.tenantId) {
    const tenantRows = await deps.db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
    if (tenantRows[0]?.slug !== input.tenantSlug) {
      return err(
        new AppError({
          code: 'invalid_credentials',
          message: 'Invalid email or password',
          status: 401
        })
      );
    }
  }

  const roles = await loadRoleNames(deps.db, user.id);
  await deps.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const authenticated: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    tenantId: user.tenantId,
    isPlatformAdmin: user.isPlatformAdmin,
    roles
  };

  return ok({ tokens: await issueTokens(deps, authenticated, meta), user: authenticated });
};

export const registerTenant = async (
  deps: AppDeps,
  input: RegisterTenantInput,
  meta: SessionMeta
): Promise<Result<AuthResult, AppError>> => {
  const slug = slugify(input.tenantSlug);
  const existingSlug = await deps.db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (existingSlug.length > 0) {
    return err(AppError.conflict('That tenant slug is already taken'));
  }

  const existingEmail = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existingEmail.length > 0) {
    return err(AppError.conflict('An account with that email already exists'));
  }

  const passwordHash = await hashPassword(input.password);

  const result = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;

    const tenantRows = await tx
      .insert(tenants)
      .values({
        name: input.tenantName,
        slug,
        settings: {
          ...DEFAULT_TENANT_SETTINGS,
          currency: input.currency,
          timezone: input.timezone,
          locale: input.locale
        }
      })
      .returning({ id: tenants.id });
    const tenant = tenantRows[0];
    if (!tenant) throw new Error('Failed to create tenant');

    const branchRows = await tx
      .insert(branches)
      .values({ tenantId: tenant.id, name: 'Main Branch', code: 'MAIN', isDefault: true })
      .returning({ id: branches.id });
    const branch = branchRows[0];
    if (!branch) throw new Error('Failed to create default branch');

    const roleRows = await tx
      .insert(rolesTable)
      .values(
        SYSTEM_ROLE_NAMES.map((role) => ({
          tenantId: tenant.id,
          name: role,
          isSystem: true,
          permissions: [...ROLE_PERMISSIONS[role]]
        }))
      )
      .returning({ id: rolesTable.id, name: rolesTable.name });
    const ownerRole = roleRows.find((role) => role.name === 'TENANT_OWNER');
    if (!ownerRole) throw new Error('Failed to create owner role');

    const userRows = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        emailVerifiedAt: new Date()
      })
      .returning({ id: users.id });
    const user = userRows[0];
    if (!user) throw new Error('Failed to create owner user');

    await tx.insert(userRoles).values({ userId: user.id, roleId: ownerRole.id });
    await tx.insert(userBranches).values({ userId: user.id, branchId: branch.id });

    return { tenantId: tenant.id, userId: user.id };
  });

  const authenticated: AuthenticatedUser = {
    id: result.userId,
    email: input.email,
    fullName: input.fullName,
    tenantId: result.tenantId,
    isPlatformAdmin: false,
    roles: ['TENANT_OWNER']
  };

  return ok({ tokens: await issueTokens(deps, authenticated, meta), user: authenticated });
};

export const rotateRefreshToken = async (
  deps: AppDeps,
  rawToken: string,
  meta: SessionMeta
): Promise<Result<TokenPair, AppError>> => {
  const hash = await hashRefreshToken(rawToken);
  const rows = await deps.db.select().from(sessions).where(eq(sessions.tokenHash, hash)).limit(1);
  const session = rows[0];
  if (!session) {
    return err(
      new AppError({ code: 'token_invalid', message: 'Invalid refresh token', status: 401 })
    );
  }

  if (session.revokedAt) {
    // Token reuse: assume compromise and revoke every session for this user.
    await deps.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, session.userId), isNull(sessions.revokedAt)));
    return err(
      new AppError({
        code: 'refresh_token_reused',
        message: 'Refresh token already used',
        status: 401
      })
    );
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    return err(
      new AppError({ code: 'token_expired', message: 'Refresh token expired', status: 401 })
    );
  }

  const userRows = await deps.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = userRows[0];
  if (!user || user.status !== 'ACTIVE') {
    return err(
      new AppError({ code: 'account_disabled', message: 'This account is not active', status: 403 })
    );
  }

  const roles = await loadRoleNames(deps.db, user.id);

  const { token: newRefreshToken, hash: newHash } = await issueRefreshToken();
  const expiresAt = addSeconds(new Date(), deps.config.auth.refreshTokenTtl);

  const inserted = await deps.db
    .insert(sessions)
    .values({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: newHash,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt
    })
    .returning({ id: sessions.id });
  const newSession = inserted[0];
  if (!newSession) throw new Error('Failed to rotate session');

  await deps.db
    .update(sessions)
    .set({ revokedAt: new Date(), replacedBySessionId: newSession.id })
    .where(eq(sessions.id, session.id));

  const { token: accessToken, expiresIn } = await signJwt(
    {
      subject: user.id,
      sessionId: newSession.id,
      tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
      roles
    },
    deps.config.auth.jwtSecret,
    deps.config.auth.accessTokenTtl
  );

  return ok({ accessToken, tokenType: 'Bearer', expiresIn, refreshToken: newRefreshToken });
};

export const revokeSession = async (deps: AppDeps, sessionId: string): Promise<void> => {
  await deps.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
};

export const listSessions = async (deps: AppDeps, userId: string) =>
  deps.db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date())
      )
    );

export const requestPasswordReset = async (deps: AppDeps, email: string): Promise<void> => {
  const rows = await deps.db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) return; // Do not reveal account existence.

  const rawToken = await issueRefreshToken();
  await deps.db.insert(verificationTokens).values({
    userId: user.id,
    type: 'PASSWORD_RESET',
    tokenHash: rawToken.hash,
    expiresAt: addSeconds(new Date(), 3600)
  });

  await deps.email.send({
    to: user.email,
    subject: 'Reset your ROMS password',
    text: `Use this token to reset your password (valid for 1 hour): ${rawToken.token}`
  });
};

export const resetPassword = async (
  deps: AppDeps,
  rawToken: string,
  password: string
): Promise<Result<void, AppError>> => {
  const hash = await sha256Hex(rawToken);
  const rows = await deps.db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.tokenHash, hash))
    .limit(1);
  const token = rows[0];
  if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
    return err(
      new AppError({
        code: 'token_invalid',
        message: 'Reset token is invalid or expired',
        status: 400
      })
    );
  }

  const passwordHash = await hashPassword(password);
  await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await tx.update(users).set({ passwordHash }).where(eq(users.id, token.userId));
    await tx
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, token.id));
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, token.userId), isNull(sessions.revokedAt)));
  });

  await invalidatePrincipal(deps.cache, token.userId);
  return ok(undefined);
};

/** Contact details for the auth boundary. */
export const getUserContact = async (
  deps: AppDeps,
  userId: string
): Promise<{ email: string; fullName: string } | null> => {
  const rows = await deps.db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
};

/** Issue a session for an already-verified user (used by OTP login). */
export const issueSessionForUser = async (
  deps: AppDeps,
  userId: string,
  meta: SessionMeta
): Promise<Result<TokenPair, AppError>> => {
  const rows = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return err(AppError.notFound('User not found'));
  if (user.status !== 'ACTIVE') {
    return err(
      new AppError({ code: 'account_disabled', message: 'This account is not active', status: 403 })
    );
  }
  const roles = await loadRoleNames(deps.db, user.id);
  const tokens = await issueTokens(
    deps,
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
      roles
    },
    meta
  );
  return ok(tokens);
};
