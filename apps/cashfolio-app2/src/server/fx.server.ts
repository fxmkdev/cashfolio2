import { BASE_CURRENCY } from "./fx/constants";
import { toSeriesTimestamp } from "./fx/date-utils";
import { getRateWithBacktracking } from "./fx/backtracking";
import {
  getCryptocurrencyBacktrackedFallbackCacheKey,
  getCryptocurrencyRedisSeriesKey,
  getCurrencyBacktrackedFallbackCacheKey,
  getCurrencyRedisSeriesKey,
  getSecurityBacktrackedFallbackCacheKey,
  getSecurityRedisSeriesKey,
} from "./fx/keys";
import {
  fetchSecurityPriceFromMarketstack,
  fetchUsdPerCryptocurrencyRateFromCoinLayer,
  fetchUsdToCurrencyRateFromCurrencyLayer,
} from "./fx/providers";

async function getUsdToCurrencyRate(
  targetCurrency: string,
  date: Date,
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
    fetchRate: (targetDate) =>
      fetchUsdToCurrencyRateFromCurrencyLayer(targetCurrency, targetDate),
  });
}

async function getUsdPerCryptocurrencyRate(
  cryptocurrency: string,
  date: Date,
): Promise<number | null> {
  return getRateWithBacktracking({
    seriesKey: getCryptocurrencyRedisSeriesKey(cryptocurrency),
    backtrackedFallbackCacheKey: getCryptocurrencyBacktrackedFallbackCacheKey(
      cryptocurrency,
      toSeriesTimestamp(date),
    ),
    date,
    fetchRate: (targetDate) =>
      fetchUsdPerCryptocurrencyRateFromCoinLayer(cryptocurrency, targetDate),
  });
}

async function getSecurityPrice(
  symbol: string,
  tradeCurrency: string,
  date: Date,
): Promise<number | null> {
  return getRateWithBacktracking({
    seriesKey: getSecurityRedisSeriesKey(symbol, tradeCurrency),
    backtrackedFallbackCacheKey: getSecurityBacktrackedFallbackCacheKey(
      symbol,
      tradeCurrency,
      toSeriesTimestamp(date),
    ),
    date,
    fetchRate: (targetDate) =>
      fetchSecurityPriceFromMarketstack(symbol, tradeCurrency, targetDate),
    stopOnExplicitNoData: false,
  });
}

export async function getCurrencyExchangeRate(args: {
  sourceCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const sourceCurrency = args.sourceCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  if (sourceCurrency === targetCurrency) {
    return 1;
  }

  try {
    const [usdToTargetRate, usdToSourceRate] = await Promise.all([
      getUsdToCurrencyRate(targetCurrency, args.date),
      getUsdToCurrencyRate(sourceCurrency, args.date),
    ]);
    if (usdToTargetRate == null || usdToSourceRate == null) {
      return null;
    }

    return usdToTargetRate / usdToSourceRate;
  } catch (error) {
    console.error(
      `Unable to retrieve FX rate for ${sourceCurrency} -> ${targetCurrency}`,
      error,
    );
    return null;
  }
}

export async function getCryptocurrencyToCurrencyExchangeRate(args: {
  cryptocurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const cryptocurrency = args.cryptocurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();

  try {
    const [usdToTargetRate, cryptoToUsdRate] = await Promise.all([
      getUsdToCurrencyRate(targetCurrency, args.date),
      getUsdPerCryptocurrencyRate(cryptocurrency, args.date),
    ]);
    if (usdToTargetRate == null || cryptoToUsdRate == null) {
      return null;
    }

    return cryptoToUsdRate * usdToTargetRate;
  } catch (error) {
    console.error(
      `Unable to retrieve FX rate for ${cryptocurrency} -> ${targetCurrency}`,
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

  try {
    const [securityPrice, tradeToTargetRate] = await Promise.all([
      getSecurityPrice(symbol, tradeCurrency, args.date),
      getCurrencyExchangeRate({
        sourceCurrency: tradeCurrency,
        targetCurrency,
        date: args.date,
      }),
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
