/**
 * Money handling.
 *
 * Financial values are NEVER computed with floating point. Internally we use
 * `bigint` scaled by {@link MONEY_SCALE} (10^4), matching the `numeric(14,4)`
 * columns used in PostgreSQL. Convert to/from decimal strings at the database
 * and API boundaries.
 */

/** Number of decimal places retained for money maths. */
export const MONEY_SCALE = 4;
const SCALE_FACTOR = 10n ** BigInt(MONEY_SCALE);

/** Scaled integer units (1 unit = 10^-4). */
export type MoneyUnits = bigint;

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Parse a decimal string (or number) into scaled units. */
export const toUnits = (value: string | number | bigint): MoneyUnits => {
  if (typeof value === 'bigint') return value * SCALE_FACTOR;
  const raw = typeof value === 'number' ? value.toFixed(MONEY_SCALE) : value.trim();
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new TypeError(`Invalid money value: ${String(value)}`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const paddedFraction = (fraction + '0'.repeat(MONEY_SCALE)).slice(0, MONEY_SCALE);
  const units = BigInt(whole) * SCALE_FACTOR + BigInt(paddedFraction || '0');
  return negative ? -units : units;
};

/** Render scaled units as a fixed-precision decimal string. */
export const fromUnits = (units: MoneyUnits): string => {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / SCALE_FACTOR;
  const fraction = (abs % SCALE_FACTOR).toString().padStart(MONEY_SCALE, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
};

export const add = (...values: MoneyUnits[]): MoneyUnits =>
  values.reduce((total, value) => total + value, 0n);

export const subtract = (a: MoneyUnits, b: MoneyUnits): MoneyUnits => a - b;

export const negate = (value: MoneyUnits): MoneyUnits => -value;

export const sum = (values: readonly MoneyUnits[]): MoneyUnits => add(...values);

/** Multiply a money amount by an integer quantity (line totals). */
export const multiplyByQuantity = (unitPrice: MoneyUnits, quantity: number): MoneyUnits => {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`Quantity must be an integer, received: ${quantity}`);
  }
  return unitPrice * BigInt(quantity);
};

/**
 * Apply a decimal rate (e.g. 0.05 for 5% tax, 0.10 for a 10% discount) with
 * half-up rounding at {@link MONEY_SCALE}.
 */
export const applyRate = (value: MoneyUnits, rate: string | number): MoneyUnits => {
  const rateUnits = toUnits(rate);
  const product = value * rateUnits;
  return divideRounded(product, SCALE_FACTOR);
};

/** Integer division with half-up rounding (handles negatives symmetrically). */
export const divideRounded = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) throw new RangeError('Cannot divide money by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
};

/** Round scaled units to whole minor units (2 decimals) — for cash amounts. */
export const roundToMinorUnits = (value: MoneyUnits): MoneyUnits =>
  divideRounded(value, 10n ** BigInt(MONEY_SCALE - 2)) * 10n ** BigInt(MONEY_SCALE - 2);

export const isZero = (value: MoneyUnits): boolean => value === 0n;
export const isNegative = (value: MoneyUnits): boolean => value < 0n;
export const equals = (a: MoneyUnits, b: MoneyUnits): boolean => a === b;
export const compare = (a: MoneyUnits, b: MoneyUnits): -1 | 0 | 1 => (a === b ? 0 : a < b ? -1 : 1);

/** Clamp to zero — discounts must never push a total below zero. */
export const clampToZero = (value: MoneyUnits): MoneyUnits => (value < 0n ? 0n : value);

/** Format for display, e.g. `formatMoney(units, "PKR", "en-PK")`. */
export const formatMoney = (value: MoneyUnits, currency: string, locale = 'en-US'): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(fromUnits(value)));
