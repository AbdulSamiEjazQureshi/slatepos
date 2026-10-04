import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ORDER_ITEM_STATUSES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  STOCK_MOVEMENT_TYPES,
  TABLE_STATUSES,
  TENANT_STATUSES,
  USER_STATUSES
} from '@roms/contracts/enums';

export const tenantStatusEnum = pgEnum('tenant_status', TENANT_STATUSES);
export const userStatusEnum = pgEnum('user_status', USER_STATUSES);
export const productStatusEnum = pgEnum('product_status', PRODUCT_STATUSES);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const orderTypeEnum = pgEnum('order_type', ORDER_TYPES);
export const orderItemStatusEnum = pgEnum('order_item_status', ORDER_ITEM_STATUSES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const stockMovementTypeEnum = pgEnum('stock_movement_type', STOCK_MOVEMENT_TYPES);
export const tableStatusEnum = pgEnum('table_status', TABLE_STATUSES);
export const discountTypeEnum = pgEnum('discount_type', ['PERCENT', 'FIXED']);
export const cashDirectionEnum = pgEnum('cash_direction', ['IN', 'OUT']);
export const otpPurposeEnum = pgEnum('otp_purpose', [
  'EMAIL_VERIFICATION',
  'LOGIN',
  'PASSWORD_RESET'
]);
