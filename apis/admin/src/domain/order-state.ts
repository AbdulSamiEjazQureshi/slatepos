import type { OrderStatus } from '@roms/contracts/enums';
import { AppError, err, ok, type Result } from '@roms/utils';

/**
 * Explicit order state machine. Invalid transitions are rejected by business
 * logic rather than being written to the database.
 *
 *   DRAFT → CONFIRMED → PREPARING → READY → COMPLETED
 *                    ↘ CANCELLED / FAILED
 *   COMPLETED → REFUNDED
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'READY', 'CANCELLED', 'FAILED'],
  PREPARING: ['READY', 'CANCELLED', 'FAILED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  FAILED: ['CONFIRMED', 'CANCELLED']
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  from === to || (TRANSITIONS[from]?.includes(to) ?? false);

export const nextStatuses = (from: OrderStatus): readonly OrderStatus[] => TRANSITIONS[from];

export const transitionOrderStatus = (
  from: OrderStatus,
  to: OrderStatus
): Result<OrderStatus, AppError> => {
  if (from === to) return ok(to);
  if (canTransition(from, to)) return ok(to);
  return err(
    AppError.unprocessable('invalid_state_transition', `Cannot move an order from ${from} to ${to}`)
  );
};

/** Statuses that consume stock and are considered "sold". */
export const SELLABLE_STATUSES: readonly OrderStatus[] = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED'
];

export const isTerminal = (status: OrderStatus): boolean =>
  status === 'CANCELLED' || status === 'REFUNDED';
