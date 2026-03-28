import { BASE_CURRENCY } from "./constants";

export function getCurrencyRedisSeriesKey(targetCurrency: string): string {
  return `fx:currencylayer:${BASE_CURRENCY}:${targetCurrency}`;
}

export function getCurrencyBacktrackedFallbackCacheKey(
  targetCurrency: string,
  requestedTimestamp: number,
): string {
  return `fx:currencylayer:fallback:${BASE_CURRENCY}:${targetCurrency}:${requestedTimestamp}`;
}

export function getCryptocurrencyRedisSeriesKey(
  cryptocurrency: string,
): string {
  return `fx:coinlayer:${BASE_CURRENCY}:${cryptocurrency}`;
}

export function getCryptocurrencyBacktrackedFallbackCacheKey(
  cryptocurrency: string,
  requestedTimestamp: number,
): string {
  return `fx:coinlayer:fallback:${BASE_CURRENCY}:${cryptocurrency}:${requestedTimestamp}`;
}

export function getSecurityRedisSeriesKey(
  symbol: string,
  tradeCurrency: string,
): string {
  return `fx:marketstack:${symbol}:${tradeCurrency}`;
}

export function getSecurityBacktrackedFallbackCacheKey(
  symbol: string,
  tradeCurrency: string,
  requestedTimestamp: number,
): string {
  return `fx:marketstack:fallback:${symbol}:${tradeCurrency}:${requestedTimestamp}`;
}
