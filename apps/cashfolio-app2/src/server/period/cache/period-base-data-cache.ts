import {
  checkResourceBudget,
  createRequestScopedInFlightMap,
} from "../../resource-context.server";
import { rethrowResourceError } from "../../resource-error";
import {
  PERIOD_BASE_CACHE_ENTRY_PREFIX,
  getPeriodBaseCacheEntryKey,
  getPeriodBaseCacheIndexKey,
} from "../../../shared/book-cache-keys";
import { encodeMoneyCache, decodeMoneyCache } from "../../money-cache-codec";
import { getRedisClient } from "../../../redis.server";
import { normalizePeriodValue } from "../../../shared/period";
import {
  loadPeriodBaseDataUncached,
  loadPeriodBaseDataSnapshot,
  type PeriodBaseData,
} from "../base-data/period-base-data-loader.server";
import {
  PERIOD_CACHE_TTL_SECONDS,
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
  getPeriodCacheGenerationKey,
  getPeriodInflightCacheKey,
  resolvePeriodCachePeriodKey,
} from "./period-cache";

const PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;

let hasWarnedPeriodBaseCacheReadFailure = false;
let hasWarnedPeriodBaseCacheWriteFailure = false;
let hasWarnedPeriodBaseCacheInvalidationFailure = false;

const getInflightLoads = createRequestScopedInFlightMap<PeriodBaseData>();

export type { PeriodBaseData };
export async function getOrLoadPeriodBaseData(args: {
  accountBookId: string;
  period?: unknown;
}): Promise<PeriodBaseData> {
  const periodValue = normalizePeriodValue(args.period);
  const inflightPeriodKey = getPeriodInflightCacheKey(periodValue);
  const loadUncached = () =>
    loadPeriodBaseDataUncached({
      accountBookId: args.accountBookId,
      period: periodValue,
    });
  const redis = await getRedisClient();
  if (!redis) {
    return loadUncached();
  }

  const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
  // Read the committed database revision before joining an inflight load. A
  // process that missed Redis cleanup must never join a pre-mutation promise.
  const generation = await getPeriodCacheGeneration({
    accountBookId: args.accountBookId,
  });
  if (generation === null) {
    return loadUncached();
  }
  const inflightKey = `${PERIOD_BASE_CACHE_ENTRY_PREFIX}:inflight:${cacheEnv}:${args.accountBookId}:${generation}:${inflightPeriodKey}`;
  const inflightByCacheKey = getInflightLoads();
  const existingInflight = inflightByCacheKey.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const loadPromise = (async () => {
    const periodCacheKey = await resolvePeriodCachePeriodKey({
      accountBookId: args.accountBookId,
      periodValue,
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
        return decodeMoneyCache<PeriodBaseData>(parsed);
      }
    } catch (error) {
      rethrowResourceError(error);
      if (!hasWarnedPeriodBaseCacheReadFailure) {
        console.warn(
          "Failed to read period base-data cache entry; continuing uncached.",
          error,
        );
        hasWarnedPeriodBaseCacheReadFailure = true;
      }
    }

    const snapshot = await loadPeriodBaseDataSnapshot({
      accountBookId: args.accountBookId,
      period: periodValue,
    });
    const loaded = snapshot.data;

    // A commit between the lookup and the snapshot must not mislabel its data.
    if (snapshot.revision !== generation) {
      return loaded;
    }

    try {
      const encoded = encodeMoneyCache(loaded);
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
        checkResourceBudget();
        await redis.setEx(entryKey, PERIOD_CACHE_TTL_SECONDS, serialized);
        checkResourceBudget();
        await redis.sAdd(indexKey, entryKey);
        checkResourceBudget();
        await redis.expire(indexKey, PERIOD_CACHE_TTL_SECONDS);
        // This pointer is only a cleanup hint. Readers use the DB revision.
        checkResourceBudget();
        await redis.set(
          getPeriodCacheGenerationKey({
            cacheEnv,
            accountBookId: args.accountBookId,
          }),
          generation,
          { NX: true },
        );
      }
    } catch (error) {
      rethrowResourceError(error);
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
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }
    const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
    const generationKey = getPeriodCacheGenerationKey({
      cacheEnv,
      accountBookId,
    });
    const previousGeneration = (await redis.get(generationKey)) ?? "0";
    const generation = await getPeriodCacheGeneration({ accountBookId });
    if (generation === null) {
      return;
    }
    // Publish the cleanup hint before deleting obsolete entries. Even if any
    // Redis command fails, the committed DB revision already invalidated them.
    checkResourceBudget();
    await redis.set(generationKey, generation);
    const indexKey = getPeriodBaseCacheIndexKey({
      cacheEnv,
      accountBookId,
      generation: previousGeneration,
    });
    const members = await redis.sMembers(indexKey);
    if (members.length > 0) {
      checkResourceBudget();
      await redis.del([...members, indexKey]);
    } else {
      checkResourceBudget();
      await redis.del(indexKey);
    }
  } catch (error) {
    rethrowResourceError(error);
    if (!hasWarnedPeriodBaseCacheInvalidationFailure) {
      console.warn(
        "Failed to clean up obsolete period cache entries; database revision still enforces invalidation.",
        error,
      );
      hasWarnedPeriodBaseCacheInvalidationFailure = true;
    }
  }
}
