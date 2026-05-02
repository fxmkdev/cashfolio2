import Decimal from "decimal.js";

export const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
});

type Stringable = { toString(): string };
export type MoneyInput = Decimal.Value | Stringable;

function toDecimalValue(value: MoneyInput): Decimal.Value {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid money number: ${value}`);
    }
    return value.toString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Decimal) {
    return value.toString();
  }

  if (value == null || typeof value.toString !== "function") {
    throw new Error("Unsupported money value.");
  }

  return value.toString();
}

export function toMoney(value: MoneyInput): Decimal {
  return new MoneyDecimal(toDecimalValue(value));
}

export function moneyAdd(left: MoneyInput, right: MoneyInput): Decimal {
  return toMoney(left).plus(toMoney(right));
}

export function moneySubtract(left: MoneyInput, right: MoneyInput): Decimal {
  return toMoney(left).minus(toMoney(right));
}

export function moneyMultiply(left: MoneyInput, right: MoneyInput): Decimal {
  return toMoney(left).times(toMoney(right));
}

export function moneyDivide(left: MoneyInput, right: MoneyInput): Decimal {
  return toMoney(left).div(toMoney(right));
}

export function moneyAbs(value: MoneyInput): Decimal {
  return toMoney(value).abs();
}

export function moneyIsZero(value: MoneyInput): boolean {
  return toMoney(value).isZero();
}

export function moneyRound2(value: MoneyInput): Decimal {
  return toMoney(value).toDecimalPlaces(2, MoneyDecimal.ROUND_HALF_EVEN);
}

export function moneySum(values: readonly MoneyInput[]): Decimal {
  let total = toMoney(0);
  for (const value of values) {
    total = total.plus(toMoney(value));
  }
  return total;
}

export function toMoneyNumber(value: MoneyInput): number {
  const numericValue = toMoney(value).toNumber();
  if (!Number.isFinite(numericValue)) {
    throw new Error("Decimal value overflowed number boundary.");
  }
  return numericValue;
}
