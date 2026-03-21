import { getRedisClient } from "../redis.server";

const BASE_CURRENCY = "USD";
const MAX_BACKTRACK_DAYS = 30;
const CURRENCYLAYER_TIMEOUT_MS = 10_000;
const FX_SERIES_RETENTION_MS = 10 * 365 * 24 * 60 * 60 * 1000;

type CurrencyLayerHistoricalResponse = {
  success: boolean;
  quotes?: Record<string, number>;
  error?: { info?: string };
};

type CachedRateResult = {
  rate: number;
  timestamp: number;
};

let hasWarnedMissingCurrencyLayerApiKey = false;

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

  const [latestEntry] = await redis.ts.revRange(key, timestamp, "-", {
    COUNT: 1,
  });
  if (!latestEntry) return null;

  return { rate: latestEntry.value, timestamp: latestEntry.timestamp };
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
      console.warn("Currencylayer request timed out", {
        targetCurrency,
        date: toDayString(date),
        timeoutMs: CURRENCYLAYER_TIMEOUT_MS,
      });
      return null;
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

  const cached = await getCachedRate(key, requestedTimestamp);
  if (cached) return cached.rate;

  let requestedDate = toUtcDay(date);
  for (let i = 0; i <= MAX_BACKTRACK_DAYS; i++) {
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
      return fetchedRate;
    }
    requestedDate = subUtcDay(requestedDate);
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
