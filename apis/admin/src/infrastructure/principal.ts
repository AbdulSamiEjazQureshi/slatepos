import { PERMISSIONS, type Permission } from '@roms/contracts/permissions';
import type { UserStatus } from '@roms/contracts/enums';
import {
  branches as branchesTable,
  eq,
  roles as rolesTable,
  userBranches,
  userRoles,
  users,
  type Db
} from '@roms/database';
import type { Cache } from './cache';

/** The authenticated subject, with resolved roles/permissions/branch access. */
export type Principal = {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly isPlatformAdmin: boolean;
  readonly status: UserStatus;
  readonly roles: readonly string[];
  readonly permissions: ReadonlySet<Permission>;
  readonly branchIds: readonly string[];
};

const ALL_PERMISSIONS = new Set<Permission>(PERMISSIONS);

const expandPermissions = (grants: readonly string[]): Set<Permission> => {
  if (grants.includes('*')) return new Set(ALL_PERMISSIONS);
  const set = new Set<Permission>();
  for (const grant of grants) {
    if ((PERMISSIONS as readonly string[]).includes(grant)) set.add(grant as Permission);
  }
  return set;
};

const CACHE_TTL_SECONDS = 60;

const cacheKey = (userId: string): string => `principal:${userId}`;

export const invalidatePrincipal = async (cache: Cache, userId: string): Promise<void> => {
  await cache.del(cacheKey(userId));
};

/**
 * Resolve a user into a Principal. Results are cached briefly so that a busy
 * POS session does not re-query roles/permissions on every request, while
 * permission changes still take effect within a minute.
 */
export const loadPrincipal = async (
  db: Db,
  cache: Cache,
  userId: string
): Promise<Principal | null> => {
  const cached = await cache.get<Principal>(cacheKey(userId));
  if (cached) return cached;

  const userRows = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      status: users.status,
      isPlatformAdmin: users.isPlatformAdmin
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user) return null;

  const [roleRows, branchRows] = await Promise.all([
    db
      .select({ name: rolesTable.name, permissions: rolesTable.permissions })
      .from(userRoles)
      .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId)),
    db
      .select({ branchId: userBranches.branchId, isActive: branchesTable.isActive })
      .from(userBranches)
      .innerJoin(branchesTable, eq(branchesTable.id, userBranches.branchId))
      .where(eq(userBranches.userId, userId))
  ]);

  const grants = roleRows.flatMap((row) => row.permissions);
  if (user.isPlatformAdmin) grants.push('*');

  const principal: Principal = {
    userId: user.id,
    tenantId: user.tenantId,
    isPlatformAdmin: user.isPlatformAdmin,
    status: user.status,
    roles: roleRows.map((row) => row.name),
    permissions: expandPermissions(grants),
    branchIds: branchRows.filter((row) => row.isActive).map((row) => row.branchId)
  };

  await cache.set(cacheKey(userId), principal, CACHE_TTL_SECONDS);
  return principal;
};

/** A user with an unrestricted branch scope (platform admin or wildcard role). */
export const hasGlobalBranchAccess = (principal: Principal): boolean =>
  principal.isPlatformAdmin || principal.permissions.size === ALL_PERMISSIONS.size;
