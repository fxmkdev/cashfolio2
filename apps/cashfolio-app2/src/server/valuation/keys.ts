import { BASE_CURRENCY } from "./constants";

export function getCurrencyRedisSeriesKey(targetCurrency: string): string {
  return `valuation:currencylayer:${BASE_CURRENCY}:${targetCurrency}`;
}

export function getCurrencyBacktrackedFallbackCacheKey(
  targetCurrency: string,
  requestedTimestamp: number,
): string {
  return `valuation:currencylayer:fallback:${BASE_CURRENCY}:${targetCurrency}:${requestedTimestamp}`;
}

export function getCryptocurrencyRedisSeriesKey(
  cryptocurrency: string,
): string {
  return `valuation:coinlayer:${BASE_CURRENCY}:${cryptocurrency}`;
}

export function getCryptocurrencyBacktrackedFallbackCacheKey(
  cryptocurrency: string,
  requestedTimestamp: number,
): string {
  return `valuation:coinlayer:fallback:${BASE_CURRENCY}:${cryptocurrency}:${requestedTimestamp}`;
}

export function getSecurityRedisSeriesKey(
  symbol: string,
  tradeCurrency: string,
): string {
  return `valuation:marketstack:${symbol}:${tradeCurrency}`;
}

export function getSecurityBacktrackedFallbackCacheKey(
  symbol: string,
  tradeCurrency: string,
  requestedTimestamp: number,
): string {
  return `valuation:marketstack:fallback:${symbol}:${tradeCurrency}:${requestedTimestamp}`;
}
