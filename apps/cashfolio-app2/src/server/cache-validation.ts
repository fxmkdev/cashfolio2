import Decimal from "decimal.js";
import { moneyIsFinite, type Money } from "../shared/money";

export type CacheCheck<T> = (value: unknown) => value is T;
export const cacheString: CacheCheck<string> = (value): value is string =>
  typeof value === "string";
export const cacheBoolean: CacheCheck<boolean> = (value): value is boolean =>
  typeof value === "boolean";
export const cacheInteger: CacheCheck<number> = (value): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
export const cacheDate: CacheCheck<Date> = (value): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());
export const cacheMoney: CacheCheck<Money> = (value): value is Money =>
  Decimal.isDecimal(value) && moneyIsFinite(value as Money);
export const cacheNullable =
  <T>(check: CacheCheck<T>): CacheCheck<T | null> =>
  (value): value is T | null =>
    value === null || check(value);
export const cacheOptional =
  <T>(check: CacheCheck<T>): CacheCheck<T | undefined> =>
  (value): value is T | undefined =>
    value === undefined || check(value);
export const cacheArray =
  <T>(check: CacheCheck<T>): CacheCheck<T[]> =>
  (value): value is T[] =>
    Array.isArray(value) && value.every(check);
export const cacheEnum =
  <const T extends readonly string[]>(values: T): CacheCheck<T[number]> =>
  (value): value is T[number] =>
    typeof value === "string" && values.includes(value);

/** Require a compatible validator for every field, including optional fields. */
export function cacheObject<T>(fields: {
  [Key in keyof T]-?: CacheCheck<T[Key]>;
}): CacheCheck<T> {
  return (value: unknown): value is T => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    for (const key in fields) if (!fields[key](record[key])) return false;
    return true;
  };
}
