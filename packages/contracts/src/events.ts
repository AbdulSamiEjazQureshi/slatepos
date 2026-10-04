import { z } from 'zod';
import { uuidSchema } from './common';
import {
  kitchenTicketStatusSchema,
  orderItemStatusSchema,
  orderStatusSchema,
  paymentStatusSchema,
  tableStatusSchema
} from './enums';

/**
 * Typed realtime event contracts. Only these shapes travel over WebSockets —
 * never raw database rows.
 */
export const orderEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('order.created'),
    orderId: uuidSchema,
    branchId: uuidSchema,
    orderNumber: z.string()
  }),
  z.object({
    type: z.literal('order.status_changed'),
    orderId: uuidSchema,
    branchId: uuidSchema,
    status: orderStatusSchema
  }),
  z.object({
    type: z.literal('order.item_status_changed'),
    orderId: uuidSchema,
    orderItemId: uuidSchema,
    status: orderItemStatusSchema
  })
]);
export type OrderEvent = z.infer<typeof orderEventSchema>;

export const tableEventSchema = z.object({
  type: z.literal('table.status_changed'),
  tableId: uuidSchema,
  branchId: uuidSchema,
  status: tableStatusSchema,
  orderId: uuidSchema.nullable()
});
export type TableEvent = z.infer<typeof tableEventSchema>;

export const paymentEventSchema = z.object({
  type: z.literal('payment.status_changed'),
  paymentId: uuidSchema,
  orderId: uuidSchema,
  status: paymentStatusSchema
});
export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export const notificationEventSchema = z.object({
  type: z.literal('notification.created'),
  notificationId: uuidSchema,
  title: z.string(),
  level: z.enum(['info', 'success', 'warning', 'error'])
});
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export const kitchenEventSchema = z.object({
  type: z.literal('kitchen.ticket_status_changed'),
  ticketId: uuidSchema,
  orderId: uuidSchema,
  branchId: uuidSchema,
  status: kitchenTicketStatusSchema
});
export type KitchenEvent = z.infer<typeof kitchenEventSchema>;

export const realtimeEventSchema = z.union([
  orderEventSchema,
  tableEventSchema,
  paymentEventSchema,
  notificationEventSchema,
  kitchenEventSchema
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

/** Topic naming for WebSocket subscriptions, e.g. `branch:<uuid>:orders`. */
export const RealtimeTopic = {
  branchOrders: (branchId: string) => `branch:${branchId}:orders`,
  branchTables: (branchId: string) => `branch:${branchId}:tables`,
  branchKitchen: (branchId: string) => `branch:${branchId}:kitchen`,
  branchPayments: (branchId: string) => `branch:${branchId}:payments`,
  user: (userId: string) => `user:${userId}`
} as const;
