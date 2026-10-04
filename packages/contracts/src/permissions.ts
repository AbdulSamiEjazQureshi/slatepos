import { z } from 'zod';
import type { Role } from './enums';

/**
 * Granular permissions. `resource.action`. Every sensitive backend operation
 * must check one of these (see `@roms/api` authorization plugin).
 */
export const PERMISSIONS = [
  'orders.read',
  'orders.create',
  'orders.update',
  'orders.cancel',
  'orders.refund',

  'payments.read',
  'payments.manage',
  'payments.refund',

  'products.read',
  'products.create',
  'products.update',
  'products.delete',

  'categories.read',
  'categories.manage',

  'inventory.read',
  'inventory.adjust',
  'inventory.transfer',

  'purchases.read',
  'purchases.manage',

  'customers.read',
  'customers.manage',

  'tables.read',
  'tables.manage',

  'kitchen.read',
  'kitchen.manage',

  'staff.read',
  'staff.manage',

  'reports.read',

  'accounting.read',
  'accounting.manage',

  'settings.read',
  'settings.manage',

  'audit.read',

  'tenants.manage'
] as const;

export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = (typeof PERMISSIONS)[number];

/** Wildcard helper used by role definitions. */
export type PermissionGrant = Permission | '*';

/** Default permission grants per built-in role. */
export const ROLE_PERMISSIONS: Record<Role, readonly PermissionGrant[]> = {
  PLATFORM_ADMIN: ['*'],
  TENANT_OWNER: ['*'],
  TENANT_ADMIN: [
    'orders.read',
    'orders.create',
    'orders.update',
    'orders.cancel',
    'orders.refund',
    'payments.read',
    'payments.manage',
    'payments.refund',
    'products.read',
    'products.create',
    'products.update',
    'products.delete',
    'categories.read',
    'categories.manage',
    'inventory.read',
    'inventory.adjust',
    'inventory.transfer',
    'purchases.read',
    'purchases.manage',
    'customers.read',
    'customers.manage',
    'tables.read',
    'tables.manage',
    'kitchen.read',
    'kitchen.manage',
    'staff.read',
    'staff.manage',
    'reports.read',
    'accounting.read',
    'accounting.manage',
    'settings.read',
    'settings.manage',
    'audit.read'
  ],
  BRANCH_MANAGER: [
    'orders.read',
    'orders.create',
    'orders.update',
    'orders.cancel',
    'payments.read',
    'payments.manage',
    'products.read',
    'categories.read',
    'inventory.read',
    'inventory.adjust',
    'purchases.read',
    'customers.read',
    'customers.manage',
    'tables.read',
    'tables.manage',
    'kitchen.read',
    'kitchen.manage',
    'staff.read',
    'reports.read'
  ],
  CASHIER: [
    'orders.read',
    'orders.create',
    'orders.update',
    'payments.read',
    'payments.manage',
    'products.read',
    'categories.read',
    'tables.read',
    'customers.read'
  ],
  KITCHEN_STAFF: ['kitchen.read', 'kitchen.manage', 'orders.read', 'products.read'],
  INVENTORY_MANAGER: [
    'inventory.read',
    'inventory.adjust',
    'inventory.transfer',
    'purchases.read',
    'purchases.manage',
    'products.read',
    'reports.read'
  ],
  ACCOUNTANT: [
    'accounting.read',
    'accounting.manage',
    'reports.read',
    'payments.read',
    'purchases.read'
  ],
  DELIVERY_MANAGER: ['orders.read', 'orders.update', 'customers.read', 'tables.read'],
  STAFF_MANAGER: ['staff.read', 'staff.manage', 'reports.read']
};

/** Expand a role (or explicit grants) into a concrete permission set. */
export const resolvePermissions = (grants: readonly PermissionGrant[]): Set<string> => {
  const set = new Set<string>();
  for (const grant of grants) {
    if (grant === '*') return new Set<string>(PERMISSIONS);
    set.add(grant);
  }
  return set;
};

export const hasPermission = (
  granted: ReadonlySet<string>,
  required: Permission | readonly Permission[]
): boolean => {
  const requiredList = Array.isArray(required) ? required : [required];
  // Any-of semantics: holding any one of the required permissions is enough.
  return requiredList.some((permission) => granted.has(permission));
};
