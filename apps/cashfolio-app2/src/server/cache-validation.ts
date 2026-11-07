import Decimal from "decimal.js";
import { moneyIsFinite, type Money } from "../shared/money";

export type CacheCheck = (value: unknown) => boolean;
export const cacheString: CacheCheck = (value) => typeof value === "string";
export const cacheBoolean: CacheCheck = (value) => typeof value === "boolean";
export const cacheInteger: CacheCheck = (value) =>
  typeof value === "number" && Number.isSafeInteger(value);
export const cacheDate: CacheCheck = (value) =>
  value instanceof Date && Number.isFinite(value.getTime());
export const cacheMoney: CacheCheck = (value) =>
  Decimal.isDecimal(value) && moneyIsFinite(value as Money);
export const cacheNullable =
  (check: CacheCheck): CacheCheck =>
  (value) =>
    value === null || check(value);
export const cacheOptional =
  (check: CacheCheck): CacheCheck =>
  (value) =>
    value === undefined || check(value);
export const cacheArray =
  (check: CacheCheck): CacheCheck =>
  (value) =>
    Array.isArray(value) && value.every(check);
export const cacheEnum =
  (values: readonly string[]): CacheCheck =>
  (value) =>
    typeof value === "string" && values.includes(value);

/** Enumerating the owning type's fields makes additions require a validator update. */
export function cacheObject<T>(fields: { [Key in keyof T]-?: CacheCheck }): (
  value: unknown,
) => value is T {
  return (value: unknown): value is T => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    for (const key in fields) if (!fields[key](record[key])) return false;
    return true;
  };
}
