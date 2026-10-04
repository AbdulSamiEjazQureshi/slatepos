import { describe, expect, test } from 'bun:test';
import { canTransition, isTerminal, nextStatuses, transitionOrderStatus } from './order-state';

describe('order state machine', () => {
  test('allows the happy path', () => {
    expect(canTransition('DRAFT', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'PREPARING')).toBe(true);
    expect(canTransition('PREPARING', 'READY')).toBe(true);
    expect(canTransition('READY', 'COMPLETED')).toBe(true);
    expect(canTransition('COMPLETED', 'REFUNDED')).toBe(true);
  });

  test('rejects illegal transitions', () => {
    expect(canTransition('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'DRAFT')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('REFUNDED', 'COMPLETED')).toBe(false);
  });

  test('returns a domain error for invalid transitions', () => {
    const result = transitionOrderStatus('COMPLETED', 'PREPARING');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(422);
      expect(result.error.code).toBe('invalid_state_transition');
    }
  });

  test('treats a no-op transition as valid', () => {
    expect(transitionOrderStatus('PREPARING', 'PREPARING').ok).toBe(true);
  });

  test('marks terminal states', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('REFUNDED')).toBe(true);
    expect(isTerminal('READY')).toBe(false);
    expect(nextStatuses('CANCELLED')).toHaveLength(0);
  });
});
