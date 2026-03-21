import { format, subDays } from "date-fns";
import { getRedisClient } from "../redis.server";

const BASE_CURRENCY = "USD";
const MAX_BACKTRACK_DAYS = 30;

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
  return format(date, "yyyy-MM-dd");
}

function toSeriesTimestamp(date: Date): number {
  return Date.parse(`${toDayString(date)}T00:00:00.000Z`);
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

  const [latestEntry] = await redis.ts.revRange(key, "-", timestamp, {
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

  await redis.ts.add(key, timestamp, rate, { ON_DUPLICATE: "LAST" });
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
  const response = await fetch(url);
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

  let requestedDate = date;
  for (let i = 0; i <= MAX_BACKTRACK_DAYS; i++) {
    const fetchedRate = await fetchUsdToCurrencyRateFromCurrencyLayer(
      targetCurrency,
      requestedDate,
    );
    if (fetchedRate != null) {
      await storeCachedRate(key, toSeriesTimestamp(requestedDate), fetchedRate);
      return fetchedRate;
    }
    requestedDate = subDays(requestedDate, 1);
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
