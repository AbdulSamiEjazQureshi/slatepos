import { Elysia } from 'elysia';
import {
  createRoleSchema,
  createUserSchema,
  listUsersQuerySchema,
  roleDtoSchema,
  updateRoleSchema,
  updateUserSchema,
  userSchema
} from '@roms/contracts/users';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import {
  createRole,
  createUser,
  getUser,
  listRoles,
  listUsers,
  updateRole,
  updateUser
} from './users.service';

export const usersModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/users', tags: ['users'] })
    .use(authPlugin(deps))
    .get(
      '/',
      async ({ ctx, query }) => {
        const tenantId = requireTenantId(ctx);
        return listUsers(deps, tenantId, query);
      },
      {
        requireTenant: true,
        requirePermission: 'staff.read',
        query: listUsersQuerySchema,
        detail: { summary: 'List users in the tenant' }
      }
    )
    .post(
      '/',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const user = await createUser(deps, tenantId, body);
        await recordAudit(deps.db, ctx, {
          action: 'user.created',
          entity: 'user',
          entityId: user.id,
          newValues: { email: user.email, roles: user.roles }
        });
        return user;
      },
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: createUserSchema,
        response: { 200: userSchema },
        detail: { summary: 'Create a user' }
      }
    )
    .get('/:id', async ({ ctx, params }) => getUser(deps, requireTenantId(ctx), params.id), {
      requireTenant: true,
      requirePermission: 'staff.read',
      response: { 200: userSchema },
      detail: { summary: 'Get a user by id' }
    })
    .patch(
      '/:id',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const user = await updateUser(deps, tenantId, params.id, body);
        await recordAudit(deps.db, ctx, {
          action: 'user.updated',
          entity: 'user',
          entityId: user.id,
          newValues: { status: user.status, roles: user.roles }
        });
        return user;
      },
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: updateUserSchema,
        response: { 200: userSchema },
        detail: { summary: 'Update a user, including roles and branch access' }
      }
    );

export const rolesModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/roles', tags: ['users'] })
    .use(authPlugin(deps))
    .get('/', async ({ ctx }) => listRoles(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'staff.read',
      detail: { summary: 'List roles in the tenant' }
    })
    .post(
      '/',
      async ({ ctx, body }) => {
        const tenantId = requireTenantId(ctx);
        const role = await createRole(deps, tenantId, body);
        await recordAudit(deps.db, ctx, {
          action: 'role.created',
          entity: 'role',
          entityId: role.id,
          newValues: { name: role.name, permissions: role.permissions }
        });
        return role;
      },
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: createRoleSchema,
        response: { 200: roleDtoSchema },
        detail: { summary: 'Create a custom role' }
      }
    )
    .patch(
      '/:id',
      async ({ ctx, params, body }) => {
        const tenantId = requireTenantId(ctx);
        const role = await updateRole(deps, tenantId, params.id, body);
        await recordAudit(deps.db, ctx, {
          action: 'role.updated',
          entity: 'role',
          entityId: role.id,
          newValues: { permissions: role.permissions }
        });
        return role;
      },
      {
        requireTenant: true,
        requirePermission: 'staff.manage',
        body: updateRoleSchema,
        response: { 200: roleDtoSchema },
        detail: { summary: 'Update a role and its permissions' }
      }
    );
