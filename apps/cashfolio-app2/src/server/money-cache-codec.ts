import Decimal from "decimal.js";
import { toMoney } from "../shared/money";

/** JSON codec for server snapshots, preserving decimal values and UTC dates. */
export function encodeMoneyCache(value: unknown): unknown {
  if (Decimal.isDecimal(value)) {
    return { __cashfolioDecimal: toMoney(value).toString() };
  }
  if (value instanceof Date) {
    return { __cashfolioDateMs: value.getTime() };
  }
  if (Array.isArray(value)) return value.map(encodeMoneyCache);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeMoneyCache(item)]),
    );
  }
  return value;
}

export function decodeMoneyCache<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map(decodeMoneyCache) as T;
  if (value != null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("__cashfolioDecimal" in record) {
      if (typeof record.__cashfolioDecimal !== "string") {
        throw new Error("Invalid cached decimal.");
      }
      return toMoney(record.__cashfolioDecimal) as T;
    }
    if ("__cashfolioDateMs" in record) {
      if (
        typeof record.__cashfolioDateMs !== "number" ||
        !Number.isFinite(record.__cashfolioDateMs)
      ) {
        throw new Error("Invalid cached date.");
      }
      const date = new Date(record.__cashfolioDateMs);
      if (!Number.isFinite(date.getTime()))
        throw new Error("Invalid cached date.");
      return date as T;
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        decodeMoneyCache(item),
      ]),
    ) as T;
  }
  return value as T;
}
