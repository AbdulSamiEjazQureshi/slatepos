import { and, asc, count, eq, ilike, inArray, or } from '@roms/database';
import {
  branches,
  roles as rolesTable,
  userBranches,
  userRoles,
  users,
  type Db,
  type RoleRow
} from '@roms/database';
import type {
  CreateRoleInput,
  CreateUserInput,
  UpdateRoleInput,
  UpdateUserInput,
  UserDto
} from '@roms/contracts/users';
import type { ListQuery } from '@roms/contracts/common';
import { AppError, normalizePagination, type PaginationMeta } from '@roms/utils';
import type { AppDeps } from '../../app/deps';
import { hashPassword } from '../../lib/password';
import { invalidatePrincipal } from '../../infrastructure/principal';

export type UserListFilters = ListQuery & { status?: UserDto['status']; role?: string };

type UserRow = typeof users.$inferSelect;

const toUserDto = (row: UserRow, roleNames: string[], branchIds: string[]): UserDto => ({
  id: row.id,
  tenantId: row.tenantId,
  email: row.email,
  fullName: row.fullName,
  status: row.status,
  isPlatformAdmin: row.isPlatformAdmin,
  roles: roleNames,
  branchIds,
  lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const relationsFor = async (
  db: Db,
  userIds: string[]
): Promise<{ rolesByUser: Map<string, string[]>; branchesByUser: Map<string, string[]> }> => {
  const rolesByUser = new Map<string, string[]>();
  const branchesByUser = new Map<string, string[]>();
  if (userIds.length === 0) return { rolesByUser, branchesByUser };

  const [roleRows, branchRows] = await Promise.all([
    db
      .select({ userId: userRoles.userId, name: rolesTable.name })
      .from(userRoles)
      .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds)),
    db
      .select({ userId: userBranches.userId, branchId: userBranches.branchId })
      .from(userBranches)
      .where(inArray(userBranches.userId, userIds))
  ]);

  for (const row of roleRows) {
    rolesByUser.set(row.userId, [...(rolesByUser.get(row.userId) ?? []), row.name]);
  }
  for (const row of branchRows) {
    branchesByUser.set(row.userId, [...(branchesByUser.get(row.userId) ?? []), row.branchId]);
  }
  return { rolesByUser, branchesByUser };
};

export const listUsers = async (
  deps: AppDeps,
  tenantId: string,
  filters: UserListFilters
): Promise<{ items: UserDto[]; meta: PaginationMeta }> => {
  const pagination = normalizePagination(filters);

  const roleSubquery =
    filters.role !== undefined
      ? deps.db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
          .where(and(eq(rolesTable.tenantId, tenantId), eq(rolesTable.name, filters.role)))
      : undefined;

  const clauses = [
    eq(users.tenantId, tenantId),
    filters.status ? eq(users.status, filters.status) : undefined,
    filters.q
      ? or(ilike(users.fullName, `%${filters.q}%`), ilike(users.email, `%${filters.q}%`))
      : undefined,
    roleSubquery ? inArray(users.id, roleSubquery) : undefined
  ].filter((clause) => clause !== undefined);

  const where = and(...clauses);

  const [rows, totals] = await Promise.all([
    deps.db
      .select()
      .from(users)
      .where(where)
      .orderBy(asc(users.fullName))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    deps.db.select({ value: count() }).from(users).where(where)
  ]);

  const { rolesByUser, branchesByUser } = await relationsFor(
    deps.db,
    rows.map((row) => row.id)
  );

  return {
    items: rows.map((row) =>
      toUserDto(row, rolesByUser.get(row.id) ?? [], branchesByUser.get(row.id) ?? [])
    ),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: totals[0]?.value ?? 0,
      totalPages: Math.ceil((totals[0]?.value ?? 0) / pagination.pageSize),
      hasNext: pagination.page < Math.ceil((totals[0]?.value ?? 0) / pagination.pageSize),
      hasPrevious: pagination.page > 1
    }
  };
};

export const getUser = async (
  deps: AppDeps,
  tenantId: string,
  userId: string
): Promise<UserDto> => {
  const rows = await deps.db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw AppError.notFound('User not found');
  const { rolesByUser, branchesByUser } = await relationsFor(deps.db, [row.id]);
  return toUserDto(row, rolesByUser.get(row.id) ?? [], branchesByUser.get(row.id) ?? []);
};

const resolveRoleIds = async (db: Db, tenantId: string, roleNames: string[]): Promise<string[]> => {
  if (roleNames.length === 0) return [];
  const rows = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(and(eq(rolesTable.tenantId, tenantId), inArray(rolesTable.name, roleNames)));
  const missing = roleNames.filter((name) => !rows.some((row) => row.name === name));
  if (missing.length > 0) {
    throw AppError.validation('Unknown role(s)', {
      roles: [`Unknown role(s): ${missing.join(', ')}`]
    });
  }
  return rows.map((row) => row.id);
};

const assertBranchesInTenant = async (
  db: Db,
  tenantId: string,
  branchIds: string[]
): Promise<void> => {
  if (branchIds.length === 0) return;
  const rows = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), inArray(branches.id, branchIds)));
  if (rows.length !== branchIds.length) {
    throw AppError.validation('Invalid branch selection', {
      branchIds: ['One or more branches do not belong to this tenant']
    });
  }
};

export const createUser = async (
  deps: AppDeps,
  tenantId: string,
  input: CreateUserInput
): Promise<UserDto> => {
  const existing = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing.length > 0) throw AppError.conflict('An account with that email already exists');

  const roleIds = await resolveRoleIds(deps.db, tenantId, input.roles);
  await assertBranchesInTenant(deps.db, tenantId, input.branchIds);
  const passwordHash = await hashPassword(input.password);

  const userId = await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const inserted = await tx
      .insert(users)
      .values({
        tenantId,
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        status: input.status
      })
      .returning({ id: users.id });
    const user = inserted[0];
    if (!user) throw new Error('Failed to create user');
    if (roleIds.length > 0) {
      await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId: user.id, roleId })));
    }
    if (input.branchIds.length > 0) {
      await tx
        .insert(userBranches)
        .values(input.branchIds.map((branchId) => ({ userId: user.id, branchId })));
    }
    return user.id;
  });

  return getUser(deps, tenantId, userId);
};

export const updateUser = async (
  deps: AppDeps,
  tenantId: string,
  userId: string,
  input: UpdateUserInput
): Promise<UserDto> => {
  const existing = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);
  if (existing.length === 0) throw AppError.notFound('User not found');

  const roleIds = input.roles ? await resolveRoleIds(deps.db, tenantId, input.roles) : null;
  if (input.branchIds) await assertBranchesInTenant(deps.db, tenantId, input.branchIds);

  await deps.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    if (input.fullName || input.status) {
      await tx
        .update(users)
        .set({
          ...(input.fullName ? { fullName: input.fullName } : {}),
          ...(input.status ? { status: input.status } : {}),
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    }
    if (roleIds) {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      if (roleIds.length > 0) {
        await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
      }
    }
    if (input.branchIds) {
      await tx.delete(userBranches).where(eq(userBranches.userId, userId));
      if (input.branchIds.length > 0) {
        await tx
          .insert(userBranches)
          .values(input.branchIds.map((branchId) => ({ userId, branchId })));
      }
    }
  });

  await invalidatePrincipal(deps.cache, userId);
  return getUser(deps, tenantId, userId);
};

const toRoleDto = (row: RoleRow) => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  description: row.description,
  isSystem: row.isSystem,
  permissions: row.permissions,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export const listRoles = async (deps: AppDeps, tenantId: string) => {
  const rows = await deps.db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.tenantId, tenantId))
    .orderBy(asc(rolesTable.name));
  return rows.map(toRoleDto);
};

export const createRole = async (deps: AppDeps, tenantId: string, input: CreateRoleInput) => {
  const existing = await deps.db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.tenantId, tenantId), eq(rolesTable.name, input.name)))
    .limit(1);
  if (existing.length > 0) throw AppError.conflict('A role with that name already exists');

  const inserted = await deps.db
    .insert(rolesTable)
    .values({
      tenantId,
      name: input.name,
      description: input.description ?? null,
      permissions: input.permissions,
      isSystem: false
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create role');
  return toRoleDto(row);
};

export const updateRole = async (
  deps: AppDeps,
  tenantId: string,
  roleId: string,
  input: UpdateRoleInput
) => {
  const rows = await deps.db
    .select()
    .from(rolesTable)
    .where(and(eq(rolesTable.id, roleId), eq(rolesTable.tenantId, tenantId)))
    .limit(1);
  const current = rows[0];
  if (!current) throw AppError.notFound('Role not found');
  if (current.isSystem && input.name) {
    throw AppError.validation('System role names cannot be changed');
  }

  const updated = await deps.db
    .update(rolesTable)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.permissions ? { permissions: input.permissions } : {}),
      updatedAt: new Date()
    })
    .where(eq(rolesTable.id, roleId))
    .returning();
  const row = updated[0];
  if (!row) throw new Error('Failed to update role');

  // Permission changes must take effect for affected users immediately.
  const affected = await deps.db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId));
  await Promise.all(affected.map((entry) => invalidatePrincipal(deps.cache, entry.userId)));

  return toRoleDto(row);
};
