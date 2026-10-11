import Decimal from "decimal.js";
import { toMoneyNumber } from "../shared/money";

export type NumericMoney<T> = T extends Decimal
  ? number
  : T extends Date
    ? T
    : T extends readonly (infer Item)[]
      ? NumericMoney<Item>[]
      : T extends object
        ? { [Key in keyof T]: NumericMoney<T[Key]> }
        : T;

/** Convert monetary values only after all server calculations are complete. */
export function toNumericMoney<T>(value: T): NumericMoney<T> {
  if (Decimal.isDecimal(value)) {
    return toMoneyNumber(value) as NumericMoney<T>;
  }
  if (value instanceof Date) {
    return value as NumericMoney<T>;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toNumericMoney(item)) as NumericMoney<T>;
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toNumericMoney(item)]),
    ) as NumericMoney<T>;
  }
  return value as NumericMoney<T>;
}
