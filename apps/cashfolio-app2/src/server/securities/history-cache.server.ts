import { Temporal } from "../../shared/temporal";
import type { SecurityHistoryStatus } from "../../shared/securities/contracts";
import {
  isHistoryDate,
  parseHistoryRows,
  type HistorySeries,
} from "./history-data.server";

export const HISTORY_COOLDOWN_SECONDS = 300;
export type HistoryResult = HistorySeries & SecurityHistoryStatus;
export const HISTORY_MESSAGES = {
  "no-data": "Marketstack returned no price history for this listing.",
  "no-usable-prices":
    "Marketstack returned no usable closing prices for this listing.",
  "invalid-data":
    "Marketstack returned inconsistent price history for this listing.",
} as const;
export function unavailableHistory(
  reason: keyof typeof HISTORY_MESSAGES,
  series: HistorySeries = {
    points: [],
    omissions: [],
    currency: null,
    securityType: null,
  },
): HistoryResult {
  return {
    ...series,
    points: [],
    status: "unavailable",
    reason,
    message: HISTORY_MESSAGES[reason],
    retryAt: Temporal.Now.instant()
      .add({ seconds: HISTORY_COOLDOWN_SECONDS })
      .toString(),
  };
}

export function historyCacheKey(
  symbol: string,
  mic: string,
  from: string,
  through: string,
) {
  return `securities:marketstack:history:v2:${encodeURIComponent(JSON.stringify([symbol, mic, from, through]))}`;
}

/** Validate the entire cache envelope, including observations removed from the chart. */
export function readCachedHistory(
  raw: string,
  symbol: string,
  mic: string,
  from: string,
  through: string,
): HistoryResult {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid cached history.");
  const entry = value as Record<string, unknown>;
  if (
    !Array.isArray(entry.points) ||
    !Array.isArray(entry.omissions) ||
    entry.points.length + entry.omissions.length > 5000
  )
    throw new Error("Invalid cached observations.");
  for (const field of ["currency", "securityType"] as const)
    if (
      entry[field] !== null &&
      (typeof entry[field] !== "string" ||
        !entry[field].trim() ||
        entry[field].length > (field === "currency" ? 64 : 255))
    )
      throw new Error("Invalid cached metadata.");
  const rows = entry.points.map((point: unknown) => {
    if (!point || typeof point !== "object")
      throw new Error("Invalid cached price.");
    const p = point as Record<string, unknown>;
    if (
      !isHistoryDate(p.date, from, through) ||
      typeof p.close !== "number" ||
      !Number.isFinite(p.close) ||
      p.close <= 0
    )
      throw new Error("Invalid cached price.");
    return {
      date: p.date,
      close: p.close,
      symbol,
      exchange: mic,
      price_currency: entry.currency,
      asset_type: entry.securityType,
    };
  });
  const omitted = entry.omissions.map((omission: unknown) => {
    if (!omission || typeof omission !== "object")
      throw new Error("Invalid cached omission.");
    const o = omission as Record<string, unknown>;
    if (
      !isHistoryDate(o.date, from, through) ||
      !["missing", "non-positive", "invalid"].includes(String(o.reason))
    )
      throw new Error("Invalid cached omission.");
    return {
      date: o.date,
      close:
        o.reason === "missing"
          ? null
          : o.reason === "non-positive"
            ? 0
            : "invalid",
      symbol,
      exchange: mic,
      price_currency: entry.currency,
      asset_type: entry.securityType,
    };
  });
  const series = parseHistoryRows(
    [...rows, ...omitted],
    symbol,
    mic,
    from,
    through,
  );
  // An empty response can still carry independently validated provider metadata.
  if (!rows.length && !omitted.length) {
    series.currency = entry.currency as string | null;
    series.securityType = entry.securityType as string | null;
  }
  if (entry.status === "ready" && series.points.length)
    return { ...series, status: "ready" };
  if (
    entry.status !== "unavailable" ||
    series.points.length ||
    !["no-data", "no-usable-prices", "invalid-data"].includes(
      String(entry.reason),
    ) ||
    typeof entry.retryAt !== "string"
  )
    throw new Error("Invalid cached history status.");
  const reason = entry.reason as keyof typeof HISTORY_MESSAGES;
  if (
    (reason === "no-data" && series.omissions.length) ||
    (reason === "no-usable-prices" && !series.omissions.length)
  )
    throw new Error("Invalid cached history reason.");
  const retry = Temporal.Instant.from(entry.retryAt);
  const now = Temporal.Now.instant();
  if (
    Temporal.Instant.compare(retry, now) <= 0 ||
    Temporal.Instant.compare(
      retry,
      now.add({ seconds: HISTORY_COOLDOWN_SECONDS }),
    ) > 0
  )
    throw new Error("Expired or invalid history cooldown.");
  return {
    ...series,
    status: "unavailable",
    reason,
    message: HISTORY_MESSAGES[reason],
    retryAt: retry.toString(),
  };
}
