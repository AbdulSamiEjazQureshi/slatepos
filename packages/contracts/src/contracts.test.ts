import { describe, expect, test } from 'bun:test';
import { loginSchema } from './auth';
import { createOrderSchema } from './orders';
import { hasPermission, PERMISSIONS, resolvePermissions, ROLE_PERMISSIONS } from './permissions';

describe('contracts', () => {
  test('login schema normalises the email', () => {
    const parsed = loginSchema.parse({ email: 'Owner@Demo.TEST', password: 'x' });
    expect(parsed.email).toBe('owner@demo.test');
  });

  test('the `*` grant expands to every permission', () => {
    expect(resolvePermissions(['*']).size).toBe(PERMISSIONS.length);
  });

  test('permission checks use any-of semantics', () => {
    const cashier = resolvePermissions(ROLE_PERMISSIONS.CASHIER);
    expect(hasPermission(cashier, ['orders.create', 'tenants.manage'])).toBe(true);
    expect(hasPermission(cashier, ['inventory.adjust'])).toBe(false);
  });

  test('an order requires at least one item', () => {
    expect(createOrderSchema.safeParse({ items: [], tip: '0' }).success).toBe(false);
    const valid = createOrderSchema.safeParse({
      items: [{ productId: '3f1a2b4c-0000-4000-8000-000000000000', quantity: 1 }],
      tip: '0'
    });
    expect(valid.success).toBe(true);
  });
});
