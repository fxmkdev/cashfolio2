import type { Unit } from "../../../.prisma-client/enums";
import type { Money } from "../../../shared/money";
import type { ValuationRateSource } from "../types";
import type { ValuationProviderName } from "../provider-usage.server";
import {
  getCurrencyRedisSeriesKey,
  getCryptocurrencyRedisSeriesKey,
  getSecurityRedisSeriesKey,
} from "../keys";
export type HistorySeries = {
  provider: ValuationProviderName;
  code: string;
  currency: string;
  key: string;
};
export type HistoryRequest = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
};
export type HistoryCoverage = {
  from: number;
  to: number;
  publication: number;
  expiresAt: number;
  noData?: boolean;
  /** A failed single-day probe may be skipped temporarily; it proves no gap. */
  temporary?: boolean;
};
export type HistorySnapshot = {
  points: { timestamp: number; value: number; validUntil?: number }[];
  coverage: HistoryCoverage[];
};
export type HistoryRate = {
  rate: Money | null;
  source: ValuationRateSource;
  validUntil: number;
};
export type HistoryTask = {
  series: HistorySeries[];
  from: string;
  to: string;
  mode: "range" | "day";
};
export type HistoryFailure = {
  attempts: number;
  retryAt: number;
  preferDay?: boolean;
};
export class HistoryPending extends Error {}
export class HistoryFeatureUnavailable extends Error {}
export function seriesFor(
  request: HistoryRequest,
  referenceCurrency: string,
): HistorySeries[] {
  if (
    request.unit === "CURRENCY" &&
    request.currency?.toUpperCase() === referenceCurrency
  )
    return [];
  const result: HistorySeries[] = [];
  const currency = (code: string | null) => {
    if (code && code.toUpperCase() !== "USD")
      result.push({
        provider: "CURRENCYLAYER",
        code: code.toUpperCase(),
        currency: "USD",
        key: getCurrencyRedisSeriesKey(code.toUpperCase()),
      });
  };
  currency(referenceCurrency);
  if (request.unit === "CURRENCY") currency(request.currency);
  if (request.unit === "CRYPTOCURRENCY" && request.cryptocurrency)
    result.push({
      provider: "COINLAYER",
      code: request.cryptocurrency.toUpperCase(),
      currency: "USD",
      key: getCryptocurrencyRedisSeriesKey(
        request.cryptocurrency.toUpperCase(),
      ),
    });
  if (request.unit === "SECURITY") {
    currency(request.tradeCurrency);
    if (request.symbol && request.tradeCurrency)
      result.push({
        provider: "MARKETSTACK",
        code: request.symbol.toUpperCase(),
        currency: request.tradeCurrency.toUpperCase(),
        key: getSecurityRedisSeriesKey(
          request.symbol.toUpperCase(),
          request.tradeCurrency.toUpperCase(),
        ),
      });
  }
  return [...new Map(result.map((series) => [series.key, series])).values()];
}
