import { BASE_CURRENCY } from "./constants";
import { toSeriesTimestamp } from "./date-utils";
import {
  getRateWithBacktracking,
  getRateWithBacktrackingDetails,
} from "./backtracking";
import {
  getCryptocurrencyBacktrackedFallbackCacheKey,
  getCryptocurrencyRedisSeriesKey,
  getCurrencyBacktrackedFallbackCacheKey,
  getCurrencyRedisSeriesKey,
  getSecurityBacktrackedFallbackCacheKey,
  getSecurityRedisSeriesKey,
} from "./keys";
import {
  fetchSecurityPriceFromMarketstack,
  fetchUsdPerCryptocurrencyRateFromCoinLayer,
  fetchUsdToCurrencyRateFromCurrencyLayer,
} from "./providers";
import type { ValuationLookupContext } from "./lookup-context";
import type { ValuationRateLookupResult } from "./types";

export async function getUsdToCurrencyRate(
  targetCurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<number | null> {
  if (targetCurrency === BASE_CURRENCY) {
    return 1;
  }

  return getRateWithBacktracking({
    seriesKey: getCurrencyRedisSeriesKey(targetCurrency),
    backtrackedFallbackCacheKey: getCurrencyBacktrackedFallbackCacheKey(
      targetCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate) =>
      fetchUsdToCurrencyRateFromCurrencyLayer(targetCurrency, targetDate),
  });
}

export async function getUsdToCurrencyRateDetails(
  targetCurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<ValuationRateLookupResult> {
  if (targetCurrency === BASE_CURRENCY) {
    return { rate: 1, source: "identity" };
  }

  return getRateWithBacktrackingDetails({
    seriesKey: getCurrencyRedisSeriesKey(targetCurrency),
    backtrackedFallbackCacheKey: getCurrencyBacktrackedFallbackCacheKey(
      targetCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate) =>
      fetchUsdToCurrencyRateFromCurrencyLayer(targetCurrency, targetDate),
  });
}

export async function getUsdPerCryptocurrencyRate(
  cryptocurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<number | null> {
  return getRateWithBacktracking({
    seriesKey: getCryptocurrencyRedisSeriesKey(cryptocurrency),
    backtrackedFallbackCacheKey: getCryptocurrencyBacktrackedFallbackCacheKey(
      cryptocurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate) =>
      fetchUsdPerCryptocurrencyRateFromCoinLayer(cryptocurrency, targetDate),
  });
}

export async function getUsdPerCryptocurrencyRateDetails(
  cryptocurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<ValuationRateLookupResult> {
  return getRateWithBacktrackingDetails({
    seriesKey: getCryptocurrencyRedisSeriesKey(cryptocurrency),
    backtrackedFallbackCacheKey: getCryptocurrencyBacktrackedFallbackCacheKey(
      cryptocurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate) =>
      fetchUsdPerCryptocurrencyRateFromCoinLayer(cryptocurrency, targetDate),
  });
}

export async function getSecurityPrice(
  symbol: string,
  tradeCurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<number | null> {
  return getRateWithBacktracking({
    seriesKey: getSecurityRedisSeriesKey(symbol, tradeCurrency),
    backtrackedFallbackCacheKey: getSecurityBacktrackedFallbackCacheKey(
      symbol,
      tradeCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate) =>
      fetchSecurityPriceFromMarketstack(symbol, tradeCurrency, targetDate),
    stopOnExplicitNoData: false,
  });
}

export async function getSecurityPriceDetails(
  symbol: string,
  tradeCurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<ValuationRateLookupResult> {
  return getRateWithBacktrackingDetails({
    seriesKey: getSecurityRedisSeriesKey(symbol, tradeCurrency),
    backtrackedFallbackCacheKey: getSecurityBacktrackedFallbackCacheKey(
      symbol,
      tradeCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate) =>
      fetchSecurityPriceFromMarketstack(symbol, tradeCurrency, targetDate),
    stopOnExplicitNoData: false,
  });
}
