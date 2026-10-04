import { describe, expect, test } from 'bun:test';
import {
  add,
  applyRate,
  clampToZero,
  compare,
  divideRounded,
  fromUnits,
  multiplyByQuantity,
  roundToMinorUnits,
  subtract,
  toUnits
} from './money';

describe('money', () => {
  test('parses decimals into scaled units without floating point drift', () => {
    expect(toUnits('10.50')).toBe(105000n);
    expect(toUnits('0.05')).toBe(500n);
    expect(toUnits('-3.0001')).toBe(-30001n);
    expect(toUnits(1)).toBe(10000n);
  });

  test('formats scaled units back to fixed-precision decimals', () => {
    expect(fromUnits(105000n)).toBe('10.5000');
    expect(fromUnits(-30001n)).toBe('-3.0001');
    expect(fromUnits(0n)).toBe('0.0000');
  });

  test('0.1 + 0.2 is exactly 0.3 (the classic float trap)', () => {
    expect(add(toUnits('0.1'), toUnits('0.2'))).toBe(toUnits('0.3'));
  });

  test('multiplies by integer quantities', () => {
    expect(multiplyByQuantity(toUnits('12.99'), 3)).toBe(toUnits('38.97'));
    expect(() => multiplyByQuantity(toUnits('1'), 1.5)).toThrow();
  });

  test('applies percentage rates with half-up rounding', () => {
    // 5% of 650.00 = 32.50
    expect(applyRate(toUnits('650'), '0.05')).toBe(toUnits('32.50'));
    // 16% of 150.00 = 24.00
    expect(applyRate(toUnits('150'), '0.16')).toBe(toUnits('24.00'));
  });

  test('rounds to whole minor units (2 decimals)', () => {
    expect(roundToMinorUnits(toUnits('10.005'))).toBe(toUnits('10.01'));
    expect(roundToMinorUnits(toUnits('10.004'))).toBe(toUnits('10.00'));
  });

  test('clamps negative results to zero', () => {
    expect(clampToZero(toUnits('-1'))).toBe(0n);
    expect(clampToZero(toUnits('1'))).toBe(toUnits('1'));
  });

  test('compares amounts', () => {
    expect(compare(toUnits('1'), toUnits('2'))).toBe(-1);
    expect(compare(toUnits('2'), toUnits('2'))).toBe(0);
    expect(compare(toUnits('3'), toUnits('2'))).toBe(1);
  });

  test('integer division rounds half up symmetrically', () => {
    expect(divideRounded(5n, 2n)).toBe(3n);
    expect(divideRounded(-5n, 2n)).toBe(-3n);
    expect(divideRounded(4n, 2n)).toBe(2n);
    expect(() => divideRounded(1n, 0n)).toThrow();
  });

  test('subtract preserves precision', () => {
    expect(subtract(toUnits('100'), toUnits('33.33'))).toBe(toUnits('66.67'));
  });
});
