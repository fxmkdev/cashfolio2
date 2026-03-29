import { toDayString } from "./date-utils";
import type { FetchRateResult, MarketstackEodResponse } from "./types";
import { NO_DATA_FETCH_RESULT } from "./types";

export function isNoDataProviderError(error?: {
  code?: number;
  info?: string;
}): boolean {
  const errorCode = error?.code;
  const errorInfo = error?.info?.toLowerCase();
  return (
    errorCode === 106 ||
    (typeof errorInfo === "string" &&
      (errorInfo.includes("no results") ||
        errorInfo.includes("did not return any results") ||
        errorInfo.includes("no data")))
  );
}

function toNormalizedCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function getMarketstackQuoteCurrency(point: {
  currency?: string;
  exchange_currency?: string;
  exchange?: unknown;
}): string | null {
  const directCurrency =
    toNormalizedCurrencyCode(point.currency) ??
    toNormalizedCurrencyCode(point.exchange_currency);
  if (directCurrency) return directCurrency;

  if (point.exchange && typeof point.exchange === "object") {
    const exchange = point.exchange as Record<string, unknown>;
    return (
      toNormalizedCurrencyCode(exchange.currency) ??
      toNormalizedCurrencyCode(exchange.exchange_currency) ??
      toNormalizedCurrencyCode(exchange.quote_currency) ??
      toNormalizedCurrencyCode(exchange.currency_code)
    );
  }

  return null;
}

export function parseMarketstackEodResponse(args: {
  response: MarketstackEodResponse;
  symbol: string;
  tradeCurrency: string;
  date: Date;
}): FetchRateResult {
  const { response, symbol, tradeCurrency, date } = args;

  if (response.error?.message) {
    const errorInfo = response.error.message.toLowerCase();
    if (
      errorInfo.includes("no data") ||
      errorInfo.includes("no result") ||
      errorInfo.includes("did not return any results")
    ) {
      return NO_DATA_FETCH_RESULT;
    }
    throw new Error(`Marketstack request failed: ${response.error.message}`);
  }

  const firstPricePoint = response.data?.[0];
  if (!firstPricePoint) {
    return null;
  }

  const quoteCurrency = getMarketstackQuoteCurrency(firstPricePoint);
  if (quoteCurrency && quoteCurrency !== tradeCurrency) {
    console.warn(
      "Marketstack security quote currency mismatch; ignoring security price point.",
      {
        symbol,
        tradeCurrency,
        quoteCurrency,
        date: toDayString(date),
      },
    );
    return null;
  }

  const price = firstPricePoint.close;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return null;
  }

  if (price <= 0) {
    console.warn(
      "Marketstack security close price is non-positive; treating as missing data.",
      {
        symbol,
        tradeCurrency,
        closePrice: price,
        date: toDayString(date),
      },
    );
    return null;
  }

  return price;
}
