import { getRedisClient } from "../redis.server";

const BASE_CURRENCY = "USD";
const MAX_BACKTRACK_DAYS = 30;
const CURRENCYLAYER_TIMEOUT_MS = 10_000;
const FX_SERIES_RETENTION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const BACKTRACKED_FALLBACK_TTL_SECONDS = 60 * 60;

type CurrencyLayerHistoricalResponse = {
  success: boolean;
  quotes?: Record<string, number>;
  error?: { code?: number; info?: string };
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

function getRedisSeriesKey(targetCurrency: string): string {
  return `fx:currencylayer:${BASE_CURRENCY}:${targetCurrency}`;
}

function getBacktrackedFallbackCacheKey(
  targetCurrency: string,
  requestedTimestamp: number,
): string {
  return `fx:currencylayer:fallback:${BASE_CURRENCY}:${targetCurrency}:${requestedTimestamp}`;
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
    const errorCode = data.error?.code;
    const errorInfo = data.error?.info?.toLowerCase();
    const isNoDataError =
      errorCode === 106 ||
      (typeof errorInfo === "string" &&
        (errorInfo.includes("no results") ||
          errorInfo.includes("did not return any results") ||
          errorInfo.includes("no data")));
    if (isNoDataError) {
      return null;
    }

    throw new Error(
      `Currencylayer request failed: ${data.error?.info ?? "Unknown error"}`,
    );
  }

  const quote = data.quotes?.[`${BASE_CURRENCY}${targetCurrency}`];
  return typeof quote === "number" ? quote : null;
}

async function getUsdToCurrencyRate(
  targetCurrency: string,
  date: Date,
): Promise<number | null> {
  if (targetCurrency === BASE_CURRENCY) {
    return 1;
  }

  const key = getRedisSeriesKey(targetCurrency);
  const requestedTimestamp = toSeriesTimestamp(date);
  const backtrackedFallbackCacheKey = getBacktrackedFallbackCacheKey(
    targetCurrency,
    requestedTimestamp,
  );

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

  let requestedDate = toUtcDay(date);
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

    const fetchedRate = await fetchUsdToCurrencyRateFromCurrencyLayer(
      targetCurrency,
      requestedDate,
    );
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
