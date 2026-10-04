import { describe, expect, test } from 'bun:test';
import { toUnits } from '@roms/utils/money';
import { calculateOrderTotals, formatPricing } from './pricing';

describe('pricing engine', () => {
  test('computes line totals with modifiers and tax', () => {
    const result = calculateOrderTotals({
      lines: [
        { unitPrice: '650', quantity: 2, taxRate: '0.05', modifiers: [{ priceDelta: '80' }] }
      ],
      tip: '0'
    });
    // (650 + 80) * 2 = 1460 ; tax 5% = 73 ; total 1533
    expect(result.totals.subtotal).toBe(toUnits('1460'));
    expect(result.totals.taxTotal).toBe(toUnits('73'));
    expect(result.totals.grandTotal).toBe(toUnits('1533'));
  });

  test('applies a percentage discount and allocates it across lines', () => {
    const result = calculateOrderTotals({
      lines: [
        { unitPrice: '100', quantity: 1, taxRate: '0' },
        { unitPrice: '300', quantity: 1, taxRate: '0' }
      ],
      discount: { type: 'PERCENT', value: '0.10' },
      tip: '0'
    });
    // subtotal 400, 10% discount = 40, allocated 10/30
    expect(result.totals.discountTotal).toBe(toUnits('40'));
    expect(result.lines[0]?.discountAmount).toBe(toUnits('10'));
    expect(result.lines[1]?.discountAmount).toBe(toUnits('30'));
    expect(result.totals.grandTotal).toBe(toUnits('360'));
  });

  test('clamps a fixed discount to the subtotal', () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: '100', quantity: 1, taxRate: '0' }],
      discount: { type: 'FIXED', value: '250' },
      tip: '0'
    });
    expect(result.totals.discountTotal).toBe(toUnits('100'));
    expect(result.totals.grandTotal).toBe(0n);
  });

  test('discount allocation always sums exactly to the discount total', () => {
    const result = calculateOrderTotals({
      lines: [
        { unitPrice: '10', quantity: 1, taxRate: '0' },
        { unitPrice: '10', quantity: 1, taxRate: '0' },
        { unitPrice: '10', quantity: 1, taxRate: '0' }
      ],
      discount: { type: 'PERCENT', value: '0.10' },
      tip: '0'
    });
    const allocated = result.lines.reduce((total, line) => total + line.discountAmount, 0n);
    expect(allocated).toBe(result.totals.discountTotal);
  });

  test('adds service charge, tip and delivery to the grand total', () => {
    const result = calculateOrderTotals({
      lines: [{ unitPrice: '1000', quantity: 1, taxRate: '0.05' }],
      serviceChargeRate: '0.10',
      tip: '50',
      deliveryFee: '100'
    });
    // subtotal 1000, tax 50, service 100, tip 50, delivery 100 => 1300
    expect(result.totals.grandTotal).toBe(toUnits('1300'));
  });

  test('formats the result into decimal strings for the API', () => {
    const formatted = formatPricing(
      calculateOrderTotals({
        lines: [{ unitPrice: '650', quantity: 1, taxRate: '0.05' }],
        tip: '0'
      })
    );
    expect(formatted.totals.subtotal).toBe('650.0000');
    expect(formatted.totals.taxTotal).toBe('32.5000');
    expect(formatted.totals.grandTotal).toBe('682.5000');
  });

  test('rejects an empty order', () => {
    expect(() => calculateOrderTotals({ lines: [], tip: '0' })).toThrow();
  });
});
