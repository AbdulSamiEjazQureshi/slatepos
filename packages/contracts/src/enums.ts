import { z } from 'zod';

/** Canonical enums. The `as const` tuples double as Zod inputs and TS unions. */

export const ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'FAILED'
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TYPES = ['DINE_IN', 'TAKEAWAY', 'PICKUP', 'DELIVERY', 'ONLINE'] as const;
export const orderTypeSchema = z.enum(ORDER_TYPES);
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_ITEM_STATUSES = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'VOID'] as const;
export const orderItemStatusSchema = z.enum(ORDER_ITEM_STATUSES);
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
  'CANCELLED'
] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const TABLE_STATUSES = [
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
  'OUT_OF_SERVICE'
] as const;
export const tableStatusSchema = z.enum(TABLE_STATUSES);
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const STOCK_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'WASTAGE',
  'PRODUCTION',
  'REVERSAL'
] as const;
export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = (typeof USER_STATUSES)[number];

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export const tenantStatusSchema = z.enum(TENANT_STATUSES);
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Roles shipped with the platform. Custom tenant roles extend these. */
export const ROLES = [
  'PLATFORM_ADMIN',
  'TENANT_OWNER',
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'CASHIER',
  'KITCHEN_STAFF',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
  'DELIVERY_MANAGER',
  'STAFF_MANAGER'
] as const;
export const roleSchema = z.enum(ROLES);
export type Role = (typeof ROLES)[number];

export const KITCHEN_TICKET_STATUSES = ['NEW', 'PREPARING', 'READY', 'SERVED', 'VOID'] as const;
export const kitchenTicketStatusSchema = z.enum(KITCHEN_TICKET_STATUSES);
export type KitchenTicketStatus = (typeof KITCHEN_TICKET_STATUSES)[number];
