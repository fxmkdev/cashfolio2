import {
  BASE_CURRENCY,
  HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE,
  HISTORICAL_DATA_DAY_LAG,
} from "./valuation/constants";
import {
  getLatestGuaranteedHistoricalUtcDay,
  toSeriesTimestamp,
} from "./valuation/date-utils";
import { getRateWithBacktracking } from "./valuation/backtracking";
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

function getLatestFetchableHistoricalDate(now = new Date()): Date {
  return getLatestGuaranteedHistoricalUtcDay({
    now,
    historicalDataDayLag: HISTORICAL_DATA_DAY_LAG,
    historicalDataAvailableAtUtcMinute: HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE,
  });
}

type ValuationLookupContext = {
  latestFetchableDate: Date;
};

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

export async function getCurrencyExchangeRate(args: {
  sourceCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const context = createValuationLookupContext();
  return getCurrencyExchangeRateWithContext(args, context);
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
