import { AppError } from '@roms/utils';
import {
  add,
  applyRate,
  clampToZero,
  divideRounded,
  fromUnits,
  subtract,
  toUnits,
  type MoneyUnits
} from '@roms/utils/money';
import type { OrderTotals } from '@roms/contracts/orders';

/**
 * The single authoritative pricing engine. Used by the POS, online ordering and
 * any future channel — never re-implemented per client. Pure and synchronous so
 * it is trivial to unit test.
 *
 * Pricing order: unit price → modifiers → line subtotal → discount → tax →
 * service charge → tip → delivery → grand total.
 */

export type PricingModifier = { priceDelta: string; quantity?: number };

export type PricingLineInput = {
  unitPrice: string;
  quantity: number;
  taxRate: string;
  modifiers?: readonly PricingModifier[];
};

export type PricingDiscount = { type: 'PERCENT' | 'FIXED'; value: string } | null;

export type PricingInput = {
  lines: readonly PricingLineInput[];
  discount?: PricingDiscount;
  serviceChargeRate?: string;
  tip?: string;
  deliveryFee?: string;
  /** When true, `unitPrice` already includes tax and tax is extracted. */
  taxInclusive?: boolean;
};

export type PricedLine = {
  lineSubtotal: MoneyUnits;
  discountAmount: MoneyUnits;
  taxAmount: MoneyUnits;
  lineTotal: MoneyUnits;
};

export type PricingTotals = {
  subtotal: MoneyUnits;
  discountTotal: MoneyUnits;
  taxTotal: MoneyUnits;
  serviceCharge: MoneyUnits;
  tip: MoneyUnits;
  deliveryFee: MoneyUnits;
  grandTotal: MoneyUnits;
};

export type PricingResult = {
  lines: PricedLine[];
  totals: PricingTotals;
};

const lineUnitPrice = (line: PricingLineInput): MoneyUnits => {
  const base = toUnits(line.unitPrice);
  const modifiers = (line.modifiers ?? []).reduce(
    (total, modifier) => add(total, toUnits(modifier.priceDelta) * BigInt(modifier.quantity ?? 1)),
    0n
  );
  if (base + modifiers < 0n) {
    throw AppError.validation('Line price cannot be negative after modifiers');
  }
  return base + modifiers;
};

/**
 * Discount is applied to the subtotal and allocated across lines proportionally
 * so that per-line tax stays correct. Rounding remainders are assigned to the
 * last line, guaranteeing the allocation always sums exactly to the discount.
 */
const allocateDiscount = (lines: MoneyUnits[], discountTotal: MoneyUnits): MoneyUnits[] => {
  const subtotal = lines.reduce((total, value) => add(total, value), 0n);
  if (discountTotal === 0n || subtotal === 0n) return lines.map(() => 0n);
  const allocations: MoneyUnits[] = [];
  let allocated = 0n;
  for (let index = 0; index < lines.length; index += 1) {
    if (index === lines.length - 1) {
      allocations.push(discountTotal - allocated);
      break;
    }
    const portion = divideRounded((lines[index] ?? 0n) * discountTotal, subtotal);
    allocated += portion;
    allocations.push(portion);
  }
  return allocations;
};

export const resolveDiscountAmount = (
  subtotal: MoneyUnits,
  discount: PricingDiscount | undefined
): MoneyUnits => {
  if (!discount) return 0n;
  const raw =
    discount.type === 'PERCENT' ? applyRate(subtotal, discount.value) : toUnits(discount.value);
  return clampToZero(raw > subtotal ? subtotal : raw);
};

export const calculateOrderTotals = (input: PricingInput): PricingResult => {
  if (input.lines.length === 0) throw AppError.validation('An order needs at least one line');

  const lineSubtotals = input.lines.map((line) => lineUnitPrice(line) * BigInt(line.quantity));
  const subtotal = lineSubtotals.reduce((total, value) => add(total, value), 0n);
  const discountTotal = resolveDiscountAmount(subtotal, input.discount);
  const discountAllocations = allocateDiscount(lineSubtotals, discountTotal);

  const lines: PricedLine[] = input.lines.map((line, index) => {
    const lineSubtotal = lineSubtotals[index] ?? 0n;
    const discountAmount = discountAllocations[index] ?? 0n;
    const taxable = subtract(lineSubtotal, discountAmount);
    const taxAmount = input.taxInclusive
      ? subtract(taxable, divideRounded(taxable * 10_000n, 10_000n + toUnits(line.taxRate)))
      : applyRate(taxable, line.taxRate);
    return { lineSubtotal, discountAmount, taxAmount, lineTotal: add(taxable, taxAmount) };
  });

  const taxTotal = lines.reduce((total, line) => add(total, line.taxAmount), 0n);
  const netSubtotal = subtract(subtotal, discountTotal);
  const serviceCharge = applyRate(netSubtotal, input.serviceChargeRate ?? '0');
  const tip = toUnits(input.tip ?? '0');
  const deliveryFee = toUnits(input.deliveryFee ?? '0');

  return {
    lines,
    totals: {
      subtotal,
      discountTotal,
      taxTotal,
      serviceCharge,
      tip,
      deliveryFee,
      grandTotal: add(netSubtotal, taxTotal, serviceCharge, tip, deliveryFee)
    }
  };
};

const money = (units: MoneyUnits): string => fromUnits(units);

export type FormattedPricing = {
  lines: { lineSubtotal: string; discountAmount: string; taxAmount: string; lineTotal: string }[];
  totals: OrderTotals;
};

/** Convert bigint pricing output into the decimal strings used by the API/DB. */
export const formatPricing = (result: PricingResult): FormattedPricing => ({
  lines: result.lines.map((line) => ({
    lineSubtotal: money(line.lineSubtotal),
    discountAmount: money(line.discountAmount),
    taxAmount: money(line.taxAmount),
    lineTotal: money(line.lineTotal)
  })),
  totals: {
    subtotal: money(result.totals.subtotal),
    discountTotal: money(result.totals.discountTotal),
    taxTotal: money(result.totals.taxTotal),
    serviceCharge: money(result.totals.serviceCharge),
    tip: money(result.totals.tip),
    deliveryFee: money(result.totals.deliveryFee),
    grandTotal: money(result.totals.grandTotal)
  }
});
