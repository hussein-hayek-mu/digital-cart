import { CURRENCY_CODE, MINOR_UNITS_PER_MAJOR } from "./constants.js";

export type MoneyAmount = {
  /** Amount in minor units (integer XOF francs). */
  amountMinor: number;
  currency: typeof CURRENCY_CODE;
};

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/**
 * Create a validated money amount in integer XOF.
 * XOF has no decimal subdivision — amountMinor equals the franc value.
 */
export function createMoney(amountMinor: number): MoneyAmount {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError("Amount must be a safe integer (XOF has no decimal units)");
  }
  if (amountMinor < 0) {
    throw new MoneyError("Amount must be non-negative");
  }
  return { amountMinor, currency: CURRENCY_CODE };
}

/** Format integer XOF for display (e.g. 1500 → "1 500 CFA"). */
export function formatMoney(money: MoneyAmount): string {
  assertSameCurrency(money);
  const formatted = money.amountMinor.toLocaleString("fr-FR");
  return `${formatted} CFA`;
}

/** Add two money amounts (must share currency). */
export function addMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinor + b.amountMinor);
}

/** Multiply a unit price by a quantity (integer only). */
export function multiplyMoney(unitPrice: MoneyAmount, quantity: number): MoneyAmount {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new MoneyError("Quantity must be a positive integer");
  }
  assertSameCurrency(unitPrice);
  const total = unitPrice.amountMinor * quantity;
  if (!Number.isSafeInteger(total)) {
    throw new MoneyError("Multiplication result exceeds safe integer range");
  }
  return createMoney(total);
}

/** Sum an array of money amounts. */
export function sumMoney(amounts: MoneyAmount[]): MoneyAmount {
  if (amounts.length === 0) {
    return createMoney(0);
  }
  return amounts.reduce((acc, amount) => addMoney(acc, amount));
}

/**
 * Parse a Wave Checkout amount string into integer minor units.
 * Wave documents XOF amounts as strings with no decimal places.
 */
export function parseWaveAmount(amount: string): MoneyAmount {
  const trimmed = amount.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new MoneyError("Wave amount must be a non-negative integer string");
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError("Wave amount exceeds safe integer range");
  }
  return createMoney(value);
}

/** Serialize money to Wave's documented amount string format. */
export function toWaveAmount(money: MoneyAmount): string {
  assertSameCurrency(money);
  return String(money.amountMinor);
}

/** Wave amount string from integer minor units (XOF, no decimals). */
export function toWaveAmountString(amountMinor: number): string {
  return toWaveAmount(createMoney(amountMinor));
}

/** Parse Wave amount string with explicit currency check. */
export function fromWaveAmountString(
  amount: string,
  currency: string,
): MoneyAmount {
  if (currency !== CURRENCY_CODE) {
    throw new MoneyError(`Unsupported currency: ${currency}`);
  }
  return parseWaveAmount(amount);
}

/** Sum cart line totals using integer arithmetic only. */
export function sumLineTotals(
  lines: Array<{ unitAmountMinor: number; quantity: number }>,
): MoneyAmount {
  let total = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.unitAmountMinor) || line.unitAmountMinor < 0) {
      throw new MoneyError("Invalid unit amount");
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new MoneyError("Invalid quantity");
    }
    const lineTotal = line.unitAmountMinor * line.quantity;
    if (!Number.isSafeInteger(lineTotal)) {
      throw new MoneyError("Line total exceeds safe integer range");
    }
    total += lineTotal;
  }
  return createMoney(total);
}

/** Convert a major-unit value to minor units (identity for XOF). */
export function toMinorUnits(majorUnits: number): number {
  if (!Number.isFinite(majorUnits)) {
    throw new MoneyError("Major units must be a finite number");
  }
  const minor = Math.round(majorUnits * MINOR_UNITS_PER_MAJOR);
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError("Minor units exceed safe integer range");
  }
  return minor;
}

/** Convert minor units to major units (identity for XOF). */
export function toMajorUnits(minorUnits: number): number {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new MoneyError("Minor units must be a safe integer");
  }
  return minorUnits / MINOR_UNITS_PER_MAJOR;
}

function assertSameCurrency(
  a: MoneyAmount,
  b?: MoneyAmount,
): asserts a is MoneyAmount {
  if (a.currency !== CURRENCY_CODE) {
    throw new MoneyError(`Unsupported currency: ${a.currency}`);
  }
  if (b && a.currency !== b.currency) {
    throw new MoneyError("Cannot combine amounts with different currencies");
  }
}
