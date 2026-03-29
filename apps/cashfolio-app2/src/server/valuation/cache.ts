import { getRedisClient } from "../../redis.server";
import { VALUATION_SERIES_RETENTION_MS } from "./constants";
import { getMissedAttemptCooldownCacheKey } from "./keys";
import type { BacktrackedFallbackCacheEntry, CachedRateResult } from "./types";

let hasWarnedValuationCacheReadFailure = false;
let hasWarnedValuationFallbackCacheReadFailure = false;
let hasWarnedValuationFallbackCacheWriteFailure = false;
let hasWarnedValuationMissCooldownCacheReadFailure = false;
let hasWarnedValuationMissCooldownCacheStoreFailure = false;
let hasWarnedValuationMissCooldownCacheClearFailure = false;

export async function getCachedRate(
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
    if (!hasWarnedValuationCacheReadFailure) {
      console.warn(
        "Failed to read valuation rate from Redis cache; continuing with API lookup.",
        error,
      );
      hasWarnedValuationCacheReadFailure = true;
    }
    return null;
  }
}

export async function storeCachedRate(
  key: string,
  timestamp: number,
  rate: number,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  await redis.ts.add(key, timestamp, rate, {
    ON_DUPLICATE: "LAST",
    RETENTION: VALUATION_SERIES_RETENTION_MS,
  });
}

export async function getBacktrackedFallbackFromCache(
  key: string,
): Promise<BacktrackedFallbackCacheEntry | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const rawValue = await redis.get(key);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as {
      kind?: unknown;
      rate?: unknown;
      sourceTimestamp?: unknown;
    };
    if (parsed.kind === "noData") {
      return { kind: "noData" };
    }

    if (
      parsed.kind === "rate" &&
      typeof parsed.rate === "number" &&
      typeof parsed.sourceTimestamp === "number"
    ) {
      return {
        kind: "rate",
        rate: parsed.rate,
        sourceTimestamp: parsed.sourceTimestamp,
      };
    }

    // Backward compatibility for previously stored entries without a `kind`.
    if (
      typeof parsed.rate === "number" &&
      typeof parsed.sourceTimestamp === "number"
    ) {
      return {
        kind: "rate",
        rate: parsed.rate,
        sourceTimestamp: parsed.sourceTimestamp,
      };
    }

    return null;
  } catch (error) {
    if (!hasWarnedValuationFallbackCacheReadFailure) {
      console.warn(
        "Failed to read backtracked valuation fallback from Redis cache; continuing without fallback cache.",
        error,
      );
      hasWarnedValuationFallbackCacheReadFailure = true;
    }
    return null;
  }
}

export async function storeBacktrackedFallbackInCache(
  key: string,
  entry: BacktrackedFallbackCacheEntry,
  ttlSeconds: number,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.setEx(key, ttlSeconds, JSON.stringify(entry));
  } catch (error) {
    if (!hasWarnedValuationFallbackCacheWriteFailure) {
      console.warn(
        "Failed to store backtracked valuation fallback in Redis cache.",
        error,
      );
      hasWarnedValuationFallbackCacheWriteFailure = true;
    }
  }
}

export async function clearBacktrackedFallbackFromCache(
  key: string,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    await redis.del(key);
  } catch (error) {
    if (!hasWarnedValuationFallbackCacheWriteFailure) {
      console.warn(
        "Failed to clear backtracked valuation fallback from Redis cache.",
        error,
      );
      hasWarnedValuationFallbackCacheWriteFailure = true;
    }
  }
}

export async function hasRecentMissedAttemptForSeriesTimestamp(
  seriesKey: string,
  timestamp: number,
): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;

    const missKey = getMissedAttemptCooldownCacheKey(seriesKey, timestamp);
    const exists = await redis.exists(missKey);
    return exists === 1;
  } catch (error) {
    if (!hasWarnedValuationMissCooldownCacheReadFailure) {
      console.warn(
        "Failed to read valuation miss-attempt cooldown from Redis cache; continuing without cooldown cache.",
        error,
      );
      hasWarnedValuationMissCooldownCacheReadFailure = true;
    }
    return false;
  }
}

export async function storeMissedAttemptForSeriesTimestamp(args: {
  seriesKey: string;
  timestamp: number;
  ttlSeconds: number;
}): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    const missKey = getMissedAttemptCooldownCacheKey(
      args.seriesKey,
      args.timestamp,
    );
    await redis.setEx(missKey, args.ttlSeconds, "1");
  } catch (error) {
    if (!hasWarnedValuationMissCooldownCacheStoreFailure) {
      console.warn(
        "Failed to store valuation miss-attempt cooldown in Redis cache.",
        error,
      );
      hasWarnedValuationMissCooldownCacheStoreFailure = true;
    }
  }
}

export async function clearMissedAttemptForSeriesTimestamp(
  seriesKey: string,
  timestamp: number,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    const missKey = getMissedAttemptCooldownCacheKey(seriesKey, timestamp);
    await redis.del(missKey);
  } catch (error) {
    if (!hasWarnedValuationMissCooldownCacheClearFailure) {
      console.warn(
        "Failed to clear valuation miss-attempt cooldown in Redis cache.",
        error,
      );
      hasWarnedValuationMissCooldownCacheClearFailure = true;
    }
  }
}
