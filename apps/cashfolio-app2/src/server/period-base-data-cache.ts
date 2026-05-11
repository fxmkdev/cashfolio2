import { getRedisClient } from "../redis.server";
import { normalizePeriodValue } from "../shared/period";
import {
  loadPeriodBaseDataUncached,
  type PeriodBaseData,
} from "./period-base-data-loader.server";
import {
  PERIOD_CACHE_TTL_SECONDS,
  advancePeriodCacheGeneration,
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
  getPeriodInflightCacheKey,
  resolvePeriodCachePeriodKey,
} from "./period-cache";

const PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;

const PERIOD_BASE_CACHE_ENTRY_PREFIX = "period:base:v1";
const PERIOD_BASE_CACHE_INDEX_PREFIX = "period:base:index:v1";

let hasWarnedPeriodBaseCacheReadFailure = false;
let hasWarnedPeriodBaseCacheWriteFailure = false;
let hasWarnedPeriodBaseCacheInvalidationFailure = false;

const inflightByCacheKey = new Map<string, Promise<PeriodBaseData>>();

type CachedDate = { __cashfolioDateMs: number };

export type { PeriodBaseData };
function isCachedDate(value: unknown): value is CachedDate {
  return (
    typeof value === "object" &&
    value != null &&
    "__cashfolioDateMs" in value &&
    typeof (value as { __cashfolioDateMs?: unknown }).__cashfolioDateMs ===
      "number"
  );
}

function encodeDatesForCache<T>(value: T): unknown {
  if (value instanceof Date) {
    return { __cashfolioDateMs: value.getTime() } satisfies CachedDate;
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodeDatesForCache(item));
  }

  if (typeof value === "object" && value != null) {
    const record = value as Record<string, unknown>;
    const encodedRecord: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(record)) {
      encodedRecord[key] = encodeDatesForCache(entryValue);
    }
    return encodedRecord;
  }

  return value;
}

function decodeDatesFromCache<T>(value: unknown): T {
  if (isCachedDate(value)) {
    return new Date(value.__cashfolioDateMs) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeDatesFromCache(item)) as T;
  }

  if (typeof value === "object" && value != null) {
    const record = value as Record<string, unknown>;
    const decodedRecord: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(record)) {
      decodedRecord[key] = decodeDatesFromCache(entryValue);
    }
    return decodedRecord as T;
  }

  return value as T;
}

function getPeriodBaseCacheEntryKey(args: {
  cacheEnv: string;
  accountBookId: string;
  generation: string;
  periodCacheKey: string;
}) {
  return `${PERIOD_BASE_CACHE_ENTRY_PREFIX}:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.periodCacheKey}`;
}

function getPeriodBaseCacheIndexKey(args: {
  cacheEnv: string;
  accountBookId: string;
  generation: string;
}) {
  return `${PERIOD_BASE_CACHE_INDEX_PREFIX}:${args.cacheEnv}:${args.accountBookId}:${args.generation}`;
}

export async function getOrLoadPeriodBaseData(args: {
  accountBookId: string;
  period?: unknown;
}): Promise<PeriodBaseData> {
  const periodValue = normalizePeriodValue(args.period);
  const inflightPeriodKey = getPeriodInflightCacheKey(periodValue);
  const inflightKey = `${PERIOD_BASE_CACHE_ENTRY_PREFIX}:inflight:${args.accountBookId}:${inflightPeriodKey}`;
  const existingInflight = inflightByCacheKey.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const loadPromise = (async () => {
    const redis = await getRedisClient();
    if (!redis) {
      return loadPeriodBaseDataUncached({
        accountBookId: args.accountBookId,
        period: periodValue,
      });
    }

    const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
    const periodCacheKey = await resolvePeriodCachePeriodKey({
      accountBookId: args.accountBookId,
      periodValue,
    });
    const generation = await getPeriodCacheGeneration({
      cacheEnv,
      accountBookId: args.accountBookId,
      redis,
    });
    const entryKey = getPeriodBaseCacheEntryKey({
      cacheEnv,
      accountBookId: args.accountBookId,
      generation,
      periodCacheKey,
    });

    try {
      const cached = await redis.get(entryKey);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        return decodeDatesFromCache<PeriodBaseData>(parsed);
      }
    } catch (error) {
      if (!hasWarnedPeriodBaseCacheReadFailure) {
        console.warn(
          "Failed to read period base-data cache entry; continuing uncached.",
          error,
        );
        hasWarnedPeriodBaseCacheReadFailure = true;
      }
    }

    const loaded = await loadPeriodBaseDataUncached({
      accountBookId: args.accountBookId,
      period: periodValue,
    });

    try {
      const encoded = encodeDatesForCache(loaded);
      const serialized = JSON.stringify(encoded);
      if (
        Buffer.byteLength(serialized, "utf8") <=
        PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES
      ) {
        const indexKey = getPeriodBaseCacheIndexKey({
          cacheEnv,
          accountBookId: args.accountBookId,
          generation,
        });
        await redis.setEx(entryKey, PERIOD_CACHE_TTL_SECONDS, serialized);
        await redis.sAdd(indexKey, entryKey);
        await redis.expire(indexKey, PERIOD_CACHE_TTL_SECONDS);
      }
    } catch (error) {
      if (!hasWarnedPeriodBaseCacheWriteFailure) {
        console.warn(
          "Failed to write period base-data cache entry; continuing uncached.",
          error,
        );
        hasWarnedPeriodBaseCacheWriteFailure = true;
      }
    }

    return loaded;
  })();

  inflightByCacheKey.set(inflightKey, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inflightByCacheKey.delete(inflightKey);
  }
}

export async function invalidatePeriodBaseDataCacheForAccountBook(
  accountBookId: string,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
  const generation = await getPeriodCacheGeneration({
    cacheEnv,
    accountBookId,
    redis,
  });
  const indexKey = getPeriodBaseCacheIndexKey({
    cacheEnv,
    accountBookId,
    generation,
  });

  try {
    const members = await redis.sMembers(indexKey);
    if (members.length > 0) {
      await redis.del([...members, indexKey]);
    } else {
      await redis.del(indexKey);
    }
    await advancePeriodCacheGeneration({
      cacheEnv,
      accountBookId,
      redis,
    });

    const inflightPrefix = `${PERIOD_BASE_CACHE_ENTRY_PREFIX}:inflight:${accountBookId}:`;
    for (const cacheKey of inflightByCacheKey.keys()) {
      if (cacheKey.startsWith(inflightPrefix)) {
        inflightByCacheKey.delete(cacheKey);
      }
    }
  } catch (error) {
    if (!hasWarnedPeriodBaseCacheInvalidationFailure) {
      console.warn(
        "Failed to invalidate period base-data cache entries; continuing without invalidation.",
        error,
      );
      hasWarnedPeriodBaseCacheInvalidationFailure = true;
    }
  }
}
