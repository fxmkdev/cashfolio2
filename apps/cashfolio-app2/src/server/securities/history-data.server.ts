import { Temporal } from "../../shared/temporal";
import type {
  PricePoint,
  PriceOmission,
} from "../../shared/securities/contracts";

export class HistoryDataError extends Error {}
export type HistorySeries = {
  points: PricePoint[];
  omissions: PriceOmission[];
  currency: string | null;
  securityType: string | null;
};

function metadata(value: unknown, max = 255): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > max)
    throw new HistoryDataError(
      "Marketstack returned malformed price metadata.",
    );
  return value.trim() || null;
}
export function isHistoryDate(
  value: unknown,
  from: string,
  through: string,
): value is string {
  if (typeof value !== "string" || value < from || value > through)
    return false;
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

export function parseHistoryRows(
  raw: unknown[],
  symbol: string,
  mic: string,
  from: string,
  through: string,
): HistorySeries {
  const points: PricePoint[] = [];
  const omissions: PriceOmission[] = [];
  const dates = new Set<string>();
  const currencies = new Set<string>();
  const types = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new HistoryDataError("Marketstack returned malformed price data.");
    const row = value as Record<string, unknown>;
    if (row.symbol !== symbol || (mic && row.exchange !== mic))
      throw new HistoryDataError(
        "Marketstack returned prices for a different listing.",
      );
    const date = metadata(row.date, 64)?.slice(0, 10);
    if (!isHistoryDate(date, from, through))
      throw new HistoryDataError("Marketstack returned an invalid price date.");
    if (dates.has(date))
      throw new HistoryDataError("Marketstack returned duplicate price dates.");
    dates.add(date);
    // Metadata must agree even on observations whose closing price is unusable.
    const currency = metadata(row.price_currency, 64);
    if (currency)
      currencies.add(
        /^[a-z]{3}$/.test(currency) ? currency.toUpperCase() : currency,
      );
    const type = metadata(row.asset_type);
    if (type) types.add(type);
    if (row.close == null) omissions.push({ date, reason: "missing" });
    else if (typeof row.close !== "number" || !Number.isFinite(row.close))
      omissions.push({ date, reason: "invalid" });
    else if (row.close <= 0) omissions.push({ date, reason: "non-positive" });
    else points.push({ date, close: row.close });
  }
  if (currencies.size > 1)
    throw new HistoryDataError(
      "Price history contains incompatible quote currencies or units.",
    );
  return {
    points: points.sort((a, b) => a.date.localeCompare(b.date)),
    omissions: omissions.sort((a, b) => a.date.localeCompare(b.date)),
    currency: [...currencies][0] ?? null,
    securityType: types.size === 1 ? [...types][0]! : null,
  };
}

/** Bounded diagnostics contain no arbitrary provider strings or response bodies. */
export function historyOmissionDiagnostics(
  raw: unknown[],
  series: HistorySeries,
) {
  const counts = { missing: 0, "non-positive": 0, invalid: 0 };
  for (const omission of series.omissions) counts[omission.reason]++;
  const samples = series.omissions.slice(0, 5).map(({ date, reason }) => {
    const row = raw.find(
      (value) =>
        value &&
        typeof value === "object" &&
        typeof (value as Record<string, unknown>).date === "string" &&
        ((value as Record<string, unknown>).date as string)
          .trim()
          .slice(0, 10) === date,
    ) as Record<string, unknown> | undefined;
    const close = row?.close;
    return {
      date,
      reason,
      valueType: close === null ? "null" : typeof close,
      ...(typeof close === "number" && Number.isFinite(close)
        ? { numericValue: close }
        : {}),
    };
  });
  return { counts, samples };
}
