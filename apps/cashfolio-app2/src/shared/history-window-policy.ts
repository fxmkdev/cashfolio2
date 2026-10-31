import { RESOURCE_LIMITS } from "./resource-limits";

export type HistoryGranularity = "month" | "year";

export function readHistoryPageSize(
  value: unknown,
  granularity: HistoryGranularity,
): number {
  if (value === undefined) return granularity === "month" ? 12 : 5;
  const max =
    granularity === "month"
      ? RESOURCE_LIMITS.historyMonths
      : RESOURCE_LIMITS.historyYears;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new Error(`History window size must be an integer from 1 to ${max}.`);
  return value;
}
