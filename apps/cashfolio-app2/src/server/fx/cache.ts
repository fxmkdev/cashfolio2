import { getRedisClient } from "../../redis.server";
import { FX_SERIES_RETENTION_MS } from "./constants";
import type { BacktrackedFallbackCacheEntry, CachedRateResult } from "./types";

let hasWarnedFxCacheReadFailure = false;
let hasWarnedFxFallbackCacheReadFailure = false;
let hasWarnedFxFallbackCacheWriteFailure = false;

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

export async function storeCachedRate(
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
    if (!hasWarnedFxFallbackCacheWriteFailure) {
      console.warn(
        "Failed to store backtracked FX fallback in Redis cache.",
        error,
      );
      hasWarnedFxFallbackCacheWriteFailure = true;
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
    if (!hasWarnedFxFallbackCacheWriteFailure) {
      console.warn(
        "Failed to clear backtracked FX fallback from Redis cache.",
        error,
      );
      hasWarnedFxFallbackCacheWriteFailure = true;
    }
  }
}
