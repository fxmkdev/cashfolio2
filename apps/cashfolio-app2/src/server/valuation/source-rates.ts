import { toMoney, type Money } from "../../shared/money";
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
import type { DecimalValuationRateLookupResult as ValuationRateLookupResult } from "./types";

export async function getUsdToCurrencyRate(
  targetCurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<Money | null> {
  if (targetCurrency === BASE_CURRENCY) {
    return toMoney(1);
  }

  return getRateWithBacktracking({
    seriesKey: getCurrencyRedisSeriesKey(targetCurrency),
    backtrackedFallbackCacheKey: getCurrencyBacktrackedFallbackCacheKey(
      targetCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate, requestReason) =>
      fetchUsdToCurrencyRateFromCurrencyLayer(
        targetCurrency,
        targetDate,
        requestReason,
      ),
  }).then((rate) => (rate == null ? null : toMoney(rate)));
}

export async function getUsdToCurrencyRateDetails(
  targetCurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<ValuationRateLookupResult> {
  if (targetCurrency === BASE_CURRENCY) {
    return { rate: toMoney(1), source: "identity" };
  }

  return getRateWithBacktrackingDetails({
    seriesKey: getCurrencyRedisSeriesKey(targetCurrency),
    backtrackedFallbackCacheKey: getCurrencyBacktrackedFallbackCacheKey(
      targetCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate, requestReason) =>
      fetchUsdToCurrencyRateFromCurrencyLayer(
        targetCurrency,
        targetDate,
        requestReason,
      ),
  }).then((result) => ({
    ...result,
    rate: result.rate == null ? null : toMoney(result.rate),
  }));
}

export async function getUsdPerCryptocurrencyRate(
  cryptocurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<Money | null> {
  return getRateWithBacktracking({
    seriesKey: getCryptocurrencyRedisSeriesKey(cryptocurrency),
    backtrackedFallbackCacheKey: getCryptocurrencyBacktrackedFallbackCacheKey(
      cryptocurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate, requestReason) =>
      fetchUsdPerCryptocurrencyRateFromCoinLayer(
        cryptocurrency,
        targetDate,
        requestReason,
      ),
  }).then((rate) => (rate == null ? null : toMoney(rate)));
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
    fetchRate: (targetDate, requestReason) =>
      fetchUsdPerCryptocurrencyRateFromCoinLayer(
        cryptocurrency,
        targetDate,
        requestReason,
      ),
  }).then((result) => ({
    ...result,
    rate: result.rate == null ? null : toMoney(result.rate),
  }));
}

export async function getSecurityPrice(
  symbol: string,
  tradeCurrency: string,
  date: Date,
  context: ValuationLookupContext,
): Promise<Money | null> {
  return getRateWithBacktracking({
    seriesKey: getSecurityRedisSeriesKey(symbol, tradeCurrency),
    backtrackedFallbackCacheKey: getSecurityBacktrackedFallbackCacheKey(
      symbol,
      tradeCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    latestFetchableDate: context.latestFetchableDate,
    fetchRate: (targetDate, requestReason) =>
      fetchSecurityPriceFromMarketstack(
        symbol,
        tradeCurrency,
        targetDate,
        requestReason,
      ),
    stopOnExplicitNoData: false,
  }).then((rate) => (rate == null ? null : toMoney(rate)));
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
    fetchRate: (targetDate, requestReason) =>
      fetchSecurityPriceFromMarketstack(
        symbol,
        tradeCurrency,
        targetDate,
        requestReason,
      ),
    stopOnExplicitNoData: false,
  }).then((result) => ({
    ...result,
    rate: result.rate == null ? null : toMoney(result.rate),
  }));
}
