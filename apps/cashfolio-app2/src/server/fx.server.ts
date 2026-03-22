import { getRedisClient } from "../redis.server";

const BASE_CURRENCY = "USD";
const MAX_BACKTRACK_DAYS = 30;
const CURRENCYLAYER_TIMEOUT_MS = 10_000;
const COINLAYER_TIMEOUT_MS = 10_000;
const MARKETSTACK_TIMEOUT_MS = 10_000;
const MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS = 1_000;
const MARKETSTACK_RATE_LIMIT_MAX_RETRIES = 3;
const FX_SERIES_RETENTION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const BACKTRACKED_FALLBACK_TTL_SECONDS = 60 * 60;

type CurrencyLayerHistoricalResponse = {
  success: boolean;
  quotes?: Record<string, number>;
  error?: { code?: number; info?: string };
};

type CoinLayerHistoricalResponse = {
  success: boolean;
  rates?: Record<string, number>;
  error?: { code?: number; info?: string };
};

type MarketstackEodResponse = {
  data?: Array<{
    close?: number;
    currency?: string;
    exchange_currency?: string;
    exchange?: unknown;
  }>;
  error?: { code?: string | number; message?: string };
};

type CachedRateResult = {
  rate: number;
  timestamp: number;
};

type BacktrackedFallbackCacheEntry = {
  rate: number;
  sourceTimestamp: number;
};

let hasWarnedMissingCurrencyLayerApiKey = false;
let hasWarnedMissingCoinLayerApiKey = false;
let hasWarnedMissingMarketstackApiKey = false;
let hasWarnedFxCacheReadFailure = false;
let hasWarnedFxFallbackCacheReadFailure = false;
let hasWarnedFxFallbackCacheWriteFailure = false;

function toDayString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toSeriesTimestamp(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toUtcDay(date: Date): Date {
  return new Date(toSeriesTimestamp(date));
}

function subUtcDay(date: Date): Date {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}

function getCurrencyRedisSeriesKey(targetCurrency: string): string {
  return `fx:currencylayer:${BASE_CURRENCY}:${targetCurrency}`;
}

function getCurrencyBacktrackedFallbackCacheKey(
  targetCurrency: string,
  requestedTimestamp: number,
): string {
  return `fx:currencylayer:fallback:${BASE_CURRENCY}:${targetCurrency}:${requestedTimestamp}`;
}

function getCryptocurrencyRedisSeriesKey(cryptocurrency: string): string {
  return `fx:coinlayer:${BASE_CURRENCY}:${cryptocurrency}`;
}

function getCryptocurrencyBacktrackedFallbackCacheKey(
  cryptocurrency: string,
  requestedTimestamp: number,
): string {
  return `fx:coinlayer:fallback:${BASE_CURRENCY}:${cryptocurrency}:${requestedTimestamp}`;
}

function getSecurityRedisSeriesKey(
  symbol: string,
  tradeCurrency: string,
): string {
  return `fx:marketstack:${symbol}:${tradeCurrency}`;
}

function getSecurityBacktrackedFallbackCacheKey(
  symbol: string,
  tradeCurrency: string,
  requestedTimestamp: number,
): string {
  return `fx:marketstack:fallback:${symbol}:${tradeCurrency}:${requestedTimestamp}`;
}

function getCurrencyLayerApiKey(): string | null {
  const apiKey = process.env.CURRENCYLAYER_API_KEY?.trim();
  if (!apiKey && !hasWarnedMissingCurrencyLayerApiKey) {
    console.warn(
      "CURRENCYLAYER_API_KEY is not set; reference-currency conversion will be unavailable when account currency differs.",
    );
    hasWarnedMissingCurrencyLayerApiKey = true;
  }
  return apiKey ?? null;
}

function getCoinLayerApiKey(): string | null {
  const apiKey = process.env.COINLAYER_API_KEY?.trim();
  if (!apiKey && !hasWarnedMissingCoinLayerApiKey) {
    console.warn(
      "COINLAYER_API_KEY is not set; cryptocurrency reference conversion will be unavailable.",
    );
    hasWarnedMissingCoinLayerApiKey = true;
  }
  return apiKey ?? null;
}

function getMarketstackApiKey(): string | null {
  const apiKey = process.env.MARKETSTACK_API_KEY?.trim();
  if (!apiKey && !hasWarnedMissingMarketstackApiKey) {
    console.warn(
      "MARKETSTACK_API_KEY is not set; security reference conversion will be unavailable.",
    );
    hasWarnedMissingMarketstackApiKey = true;
  }
  return apiKey ?? null;
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

async function getCachedRate(
  key: string,
  timestamp: number,
): Promise<CachedRateResult | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const exists = await redis.exists(key);
    if (!exists) return null;

    const [exactEntry] = await redis.ts.range(key, timestamp, timestamp, {
      COUNT: 1,
    });
    if (exactEntry) {
      return { rate: exactEntry.value, timestamp: exactEntry.timestamp };
    }

    const [latestEntry] = await redis.ts.revRange(key, "-", timestamp, {
      COUNT: 1,
    });
    if (!latestEntry) return null;

    return { rate: latestEntry.value, timestamp: latestEntry.timestamp };
  } catch (error) {
    if (!hasWarnedFxCacheReadFailure) {
      console.warn(
        "Failed to read FX rate from Redis cache; continuing with API lookup.",
        error,
      );
      hasWarnedFxCacheReadFailure = true;
    }
    return null;
  }
}

async function storeCachedRate(
  key: string,
  timestamp: number,
  rate: number,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  await redis.ts.add(key, timestamp, rate, {
    ON_DUPLICATE: "LAST",
    RETENTION: FX_SERIES_RETENTION_MS,
  });
}

async function getBacktrackedFallbackFromCache(
  key: string,
): Promise<BacktrackedFallbackCacheEntry | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const rawValue = await redis.get(key);
    if (!rawValue) return null;

    const parsed = JSON.parse(
      rawValue,
    ) as Partial<BacktrackedFallbackCacheEntry>;
    if (
      typeof parsed.rate !== "number" ||
      typeof parsed.sourceTimestamp !== "number"
    ) {
      return null;
    }

    return {
      rate: parsed.rate,
      sourceTimestamp: parsed.sourceTimestamp,
    };
  } catch (error) {
    if (!hasWarnedFxFallbackCacheReadFailure) {
      console.warn(
        "Failed to read backtracked FX fallback from Redis cache; continuing without fallback cache.",
        error,
      );
      hasWarnedFxFallbackCacheReadFailure = true;
    }
    return null;
  }
}

async function storeBacktrackedFallbackInCache(
  key: string,
  entry: BacktrackedFallbackCacheEntry,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.setEx(
      key,
      BACKTRACKED_FALLBACK_TTL_SECONDS,
      JSON.stringify(entry),
    );
  } catch (error) {
    if (!hasWarnedFxFallbackCacheWriteFailure) {
      console.warn(
        "Failed to store backtracked FX fallback in Redis cache.",
        error,
      );
      hasWarnedFxFallbackCacheWriteFailure = true;
    }
  }
}

async function clearBacktrackedFallbackFromCache(key: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    await redis.del(key);
  } catch (error) {
    if (!hasWarnedFxFallbackCacheWriteFailure) {
      console.warn(
        "Failed to clear backtracked FX fallback from Redis cache.",
        error,
      );
      hasWarnedFxFallbackCacheWriteFailure = true;
    }
  }
}

function isNoDataProviderError(error?: {
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

async function fetchUsdToCurrencyRateFromCurrencyLayer(
  targetCurrency: string,
  date: Date,
): Promise<number | null> {
  const apiKey = getCurrencyLayerApiKey();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    access_key: apiKey,
    source: BASE_CURRENCY,
    currencies: targetCurrency,
    date: toDayString(date),
  });
  const url = `https://api.currencylayer.com/historical?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CURRENCYLAYER_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Currencylayer request timed out");
      console.warn(timeoutError.message, {
        targetCurrency,
        date: toDayString(date),
        timeoutMs: CURRENCYLAYER_TIMEOUT_MS,
      });
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `Currencylayer request failed with ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CurrencyLayerHistoricalResponse;
  if (!data.success) {
    if (isNoDataProviderError(data.error)) {
      return null;
    }

    throw new Error(
      `Currencylayer request failed: ${data.error?.info ?? "Unknown error"}`,
    );
  }

  const quote = data.quotes?.[`${BASE_CURRENCY}${targetCurrency}`];
  return typeof quote === "number" ? quote : null;
}

async function fetchUsdPerCryptocurrencyRateFromCoinLayer(
  cryptocurrency: string,
  date: Date,
): Promise<number | null> {
  const apiKey = getCoinLayerApiKey();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    access_key: apiKey,
    target: BASE_CURRENCY,
    symbols: cryptocurrency,
  });
  const url = `https://api.coinlayer.com/${toDayString(date)}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COINLAYER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Coinlayer request timed out");
      console.warn(timeoutError.message, {
        cryptocurrency,
        date: toDayString(date),
        timeoutMs: COINLAYER_TIMEOUT_MS,
      });
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `Coinlayer request failed with ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CoinLayerHistoricalResponse;
  if (!data.success) {
    if (isNoDataProviderError(data.error)) {
      return null;
    }

    throw new Error(
      `Coinlayer request failed: ${data.error?.info ?? "Unknown error"}`,
    );
  }

  const rate = data.rates?.[cryptocurrency];
  return typeof rate === "number" ? rate : null;
}

async function fetchSecurityPriceFromMarketstack(
  symbol: string,
  tradeCurrency: string,
  date: Date,
  retryCount = 0,
): Promise<number | null> {
  const apiKey = getMarketstackApiKey();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    access_key: apiKey,
    symbols: symbol,
  });
  const url = `https://api.marketstack.com/v2/eod/${toDayString(date)}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKETSTACK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Marketstack request timed out");
      console.warn(timeoutError.message, {
        symbol,
        tradeCurrency,
        date: toDayString(date),
        timeoutMs: MARKETSTACK_TIMEOUT_MS,
      });
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (
    response.status === 429 &&
    retryCount < MARKETSTACK_RATE_LIMIT_MAX_RETRIES
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS),
    );
    return fetchSecurityPriceFromMarketstack(
      symbol,
      tradeCurrency,
      date,
      retryCount + 1,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Marketstack request failed with ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as MarketstackEodResponse;
  if (data.error?.message) {
    const errorInfo = data.error.message.toLowerCase();
    if (
      errorInfo.includes("no data") ||
      errorInfo.includes("no result") ||
      errorInfo.includes("did not return any results")
    ) {
      return null;
    }
    throw new Error(`Marketstack request failed: ${data.error.message}`);
  }

  const firstPricePoint = data.data?.[0];
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
  return typeof price === "number" ? price : null;
}

async function getRateWithBacktracking(args: {
  seriesKey: string;
  backtrackedFallbackCacheKey: string;
  date: Date;
  fetchRate: (date: Date) => Promise<number | null>;
}): Promise<number | null> {
  const requestedTimestamp = toSeriesTimestamp(args.date);
  const key = args.seriesKey;
  const backtrackedFallbackCacheKey = args.backtrackedFallbackCacheKey;

  const cached = await getCachedRate(key, requestedTimestamp);
  if (cached?.timestamp === requestedTimestamp) {
    await clearBacktrackedFallbackFromCache(backtrackedFallbackCacheKey);
    return cached.rate;
  }

  const cachedBacktrackedFallback = await getBacktrackedFallbackFromCache(
    backtrackedFallbackCacheKey,
  );
  if (cachedBacktrackedFallback) {
    return cachedBacktrackedFallback.rate;
  }

  let requestedDate = toUtcDay(args.date);
  for (let i = 0; i <= MAX_BACKTRACK_DAYS; i++) {
    const currentTimestamp = toSeriesTimestamp(requestedDate);
    if (cached && currentTimestamp <= cached.timestamp) {
      // We already have the newest known cached point at-or-before this day.
      await storeBacktrackedFallbackInCache(backtrackedFallbackCacheKey, {
        rate: cached.rate,
        sourceTimestamp: cached.timestamp,
      });
      return cached.rate;
    }

    const fetchedRate = await args.fetchRate(requestedDate);
    if (fetchedRate != null) {
      try {
        await storeCachedRate(
          key,
          toSeriesTimestamp(requestedDate),
          fetchedRate,
        );
      } catch (error) {
        console.error(
          "Failed to cache FX rate",
          { key, requestedDate: requestedDate.toISOString() },
          error,
        );
      }

      if (currentTimestamp < requestedTimestamp) {
        await storeBacktrackedFallbackInCache(backtrackedFallbackCacheKey, {
          rate: fetchedRate,
          sourceTimestamp: currentTimestamp,
        });
      } else {
        await clearBacktrackedFallbackFromCache(backtrackedFallbackCacheKey);
      }

      return fetchedRate;
    }
    requestedDate = subUtcDay(requestedDate);
  }

  if (cached) {
    await storeBacktrackedFallbackInCache(backtrackedFallbackCacheKey, {
      rate: cached.rate,
      sourceTimestamp: cached.timestamp,
    });
    return cached.rate;
  }

  return null;
}

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
