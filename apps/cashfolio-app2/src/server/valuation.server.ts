import {
  BASE_CURRENCY,
  HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE,
  HISTORICAL_DATA_DAY_LAG,
} from "./valuation/constants";
import {
  getLatestAssumedAvailableHistoricalUtcDay,
  toSeriesTimestamp,
} from "./valuation/date-utils";
import {
  getRateWithBacktracking,
  getRateWithBacktrackingDetails,
} from "./valuation/backtracking";
import {
  getCryptocurrencyBacktrackedFallbackCacheKey,
  getCryptocurrencyRedisSeriesKey,
  getCurrencyBacktrackedFallbackCacheKey,
  getCurrencyRedisSeriesKey,
  getSecurityBacktrackedFallbackCacheKey,
  getSecurityRedisSeriesKey,
} from "./valuation/keys";
import {
  fetchSecurityPriceFromMarketstack,
  fetchUsdPerCryptocurrencyRateFromCoinLayer,
  fetchUsdToCurrencyRateFromCurrencyLayer,
} from "./valuation/providers";
import type {
  ValuationRateLookupResult,
  ValuationRateSource,
} from "./valuation/types";

function getLatestFetchableHistoricalDate(now = new Date()): Date {
  return getLatestAssumedAvailableHistoricalUtcDay({
    now,
    historicalDataDayLag: HISTORICAL_DATA_DAY_LAG,
    historicalDataAvailableAtUtcMinute: HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE,
  });
}

type ValuationLookupContext = {
  latestFetchableDate: Date;
};

function combineValuationRateSources(
  sources: ValuationRateSource[],
): ValuationRateSource {
  if (sources.includes("missing")) return "missing";
  if (sources.includes("provider")) return "provider";
  if (sources.includes("fallback")) return "fallback";
  if (sources.includes("timeSeries")) return "timeSeries";
  return "identity";
}

function createValuationLookupContext(
  now = new Date(),
): ValuationLookupContext {
  return {
    latestFetchableDate: getLatestFetchableHistoricalDate(now),
  };
}

async function getUsdToCurrencyRate(
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

async function getUsdToCurrencyRateDetails(
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

async function getUsdPerCryptocurrencyRate(
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

async function getUsdPerCryptocurrencyRateDetails(
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

async function getSecurityPrice(
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

async function getSecurityPriceDetails(
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

async function getCurrencyExchangeRateWithContext(
  args: {
    sourceCurrency: string;
    targetCurrency: string;
    date: Date;
  },
  context: ValuationLookupContext,
): Promise<number | null> {
  const sourceCurrency = args.sourceCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  if (sourceCurrency === targetCurrency) {
    return 1;
  }

  try {
    const [usdToTargetRate, usdToSourceRate] = await Promise.all([
      getUsdToCurrencyRate(targetCurrency, args.date, context),
      getUsdToCurrencyRate(sourceCurrency, args.date, context),
    ]);
    if (usdToTargetRate == null || usdToSourceRate == null) {
      return null;
    }

    return usdToTargetRate / usdToSourceRate;
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${sourceCurrency} -> ${targetCurrency}`,
      error,
    );
    return null;
  }
}

async function getCurrencyExchangeRateDetailsWithContext(
  args: {
    sourceCurrency: string;
    targetCurrency: string;
    date: Date;
  },
  context: ValuationLookupContext,
): Promise<ValuationRateLookupResult> {
  const sourceCurrency = args.sourceCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  if (sourceCurrency === targetCurrency) {
    return { rate: 1, source: "identity" };
  }

  try {
    const [usdToTargetRate, usdToSourceRate] = await Promise.all([
      getUsdToCurrencyRateDetails(targetCurrency, args.date, context),
      getUsdToCurrencyRateDetails(sourceCurrency, args.date, context),
    ]);
    if (usdToTargetRate.rate == null || usdToSourceRate.rate == null) {
      return { rate: null, source: "missing" };
    }

    return {
      rate: usdToTargetRate.rate / usdToSourceRate.rate,
      source: combineValuationRateSources([
        usdToTargetRate.source,
        usdToSourceRate.source,
      ]),
    };
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${sourceCurrency} -> ${targetCurrency}`,
      error,
    );
    return { rate: null, source: "missing" };
  }
}

export async function getCurrencyExchangeRate(args: {
  sourceCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const context = createValuationLookupContext();
  return getCurrencyExchangeRateWithContext(args, context);
}

export async function getCurrencyExchangeRateDetails(args: {
  sourceCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<ValuationRateLookupResult> {
  const context = createValuationLookupContext();
  return getCurrencyExchangeRateDetailsWithContext(args, context);
}

export async function getCryptocurrencyToCurrencyExchangeRate(args: {
  cryptocurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const cryptocurrency = args.cryptocurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [usdToTargetRate, cryptoToUsdRate] = await Promise.all([
      getUsdToCurrencyRate(targetCurrency, args.date, context),
      getUsdPerCryptocurrencyRate(cryptocurrency, args.date, context),
    ]);
    if (usdToTargetRate == null || cryptoToUsdRate == null) {
      return null;
    }

    return cryptoToUsdRate * usdToTargetRate;
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${cryptocurrency} -> ${targetCurrency}`,
      error,
    );
    return null;
  }
}

export async function getCryptocurrencyToCurrencyExchangeRateDetails(args: {
  cryptocurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<ValuationRateLookupResult> {
  const cryptocurrency = args.cryptocurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [usdToTargetRate, cryptoToUsdRate] = await Promise.all([
      getUsdToCurrencyRateDetails(targetCurrency, args.date, context),
      getUsdPerCryptocurrencyRateDetails(cryptocurrency, args.date, context),
    ]);
    if (usdToTargetRate.rate == null || cryptoToUsdRate.rate == null) {
      return { rate: null, source: "missing" };
    }

    return {
      rate: cryptoToUsdRate.rate * usdToTargetRate.rate,
      source: combineValuationRateSources([
        usdToTargetRate.source,
        cryptoToUsdRate.source,
      ]),
    };
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${cryptocurrency} -> ${targetCurrency}`,
      error,
    );
    return { rate: null, source: "missing" };
  }
}

export async function getSecurityToCurrencyExchangeRate(args: {
  symbol: string;
  tradeCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const symbol = args.symbol.toUpperCase();
  const tradeCurrency = args.tradeCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [securityPrice, tradeToTargetRate] = await Promise.all([
      getSecurityPrice(symbol, tradeCurrency, args.date, context),
      getCurrencyExchangeRateWithContext(
        {
          sourceCurrency: tradeCurrency,
          targetCurrency,
          date: args.date,
        },
        context,
      ),
    ]);
    if (securityPrice == null || tradeToTargetRate == null) {
      return null;
    }

    return securityPrice * tradeToTargetRate;
  } catch (error) {
    console.error(
      `Unable to retrieve security exchange rate for ${symbol} (${tradeCurrency} -> ${targetCurrency})`,
      error,
    );
    return null;
  }
}

export async function getSecurityToCurrencyExchangeRateDetails(args: {
  symbol: string;
  tradeCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<ValuationRateLookupResult> {
  const symbol = args.symbol.toUpperCase();
  const tradeCurrency = args.tradeCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [securityPrice, tradeToTargetRate] = await Promise.all([
      getSecurityPriceDetails(symbol, tradeCurrency, args.date, context),
      getCurrencyExchangeRateDetailsWithContext(
        {
          sourceCurrency: tradeCurrency,
          targetCurrency,
          date: args.date,
        },
        context,
      ),
    ]);
    if (securityPrice.rate == null || tradeToTargetRate.rate == null) {
      return { rate: null, source: "missing" };
    }

    return {
      rate: securityPrice.rate * tradeToTargetRate.rate,
      source: combineValuationRateSources([
        securityPrice.source,
        tradeToTargetRate.source,
      ]),
    };
  } catch (error) {
    console.error(
      `Unable to retrieve security exchange rate for ${symbol} (${tradeCurrency} -> ${targetCurrency})`,
      error,
    );
    return { rate: null, source: "missing" };
  }
}
