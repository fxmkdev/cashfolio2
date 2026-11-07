import { isPeriodBaseDataCacheEntry } from "./period-base-data-cache-validation";
import {
  createCacheFailureReporter,
  readValidatedMoneyCache,
} from "../../money-cache-read";
import {
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../../resource-context.server";
import {
  PERIOD_BASE_CACHE_ENTRY_PREFIX,
  getPeriodBaseCacheEntryKey,
  getPeriodBaseCacheIndexKey,
} from "../../../shared/accounts/book-cache-keys";
import { encodeMoneyCache } from "../../money-cache-codec";
import { getRedisClient } from "../../../redis.server";
import { normalizePeriodValue } from "../../../shared/reporting/period";
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
} from "./period-cache.server";

const PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;

const reportPeriodBaseCacheReadFailure = createCacheFailureReporter(
  "Failed to read period base-data cache entry; continuing uncached.",
);
const reportPeriodBaseCacheWriteFailure = createCacheFailureReporter(
  "Failed to write period base-data cache entry; continuing uncached.",
);
const reportPeriodBaseCacheInvalidationFailure = createCacheFailureReporter(
  "Failed to clean up obsolete period cache entries; database revision still enforces invalidation.",
);

const runSharedLoad = createUserScopedSharedWork<PeriodBaseData>();

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
  return runSharedLoad(inflightKey, async () => {
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

    const cached = await readValidatedMoneyCache({
      read: () => redis.get(entryKey),
      maxBytes: PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES,
      validate: (value: unknown): value is PeriodBaseData =>
        isPeriodBaseDataCacheEntry(value) &&
        value.accountBookId === args.accountBookId &&
        value.periodValue === periodValue,
      reportFailure: reportPeriodBaseCacheReadFailure,
    });
    if (cached !== undefined) return cached;

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
      reportPeriodBaseCacheWriteFailure(error);
    }

    return loaded;
  });
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
    reportPeriodBaseCacheInvalidationFailure(error);
  }
}
