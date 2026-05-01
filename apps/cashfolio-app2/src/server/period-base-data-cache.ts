import { prisma } from "../prisma.server";
import { getRedisClient } from "../redis.server";
import {
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
} from "../shared/period";
import { startOfUtcDay } from "../shared/date";
import { resolvePeriodSelection } from "./period-selection";
import {
  loadPeriodBaseDataUncached,
  type PeriodBaseData,
} from "./period-base-data-loader.server";

const PERIOD_BASE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;

const PERIOD_BASE_CACHE_ENTRY_PREFIX = "period:base:v1";
const PERIOD_BASE_CACHE_INDEX_PREFIX = "period:base:index:v1";
const PERIOD_BASE_CACHE_GENERATION_PREFIX = "period:base:generation:v1";

let hasWarnedPeriodBaseCacheReadFailure = false;
let hasWarnedPeriodBaseCacheWriteFailure = false;
let hasWarnedPeriodBaseCacheInvalidationFailure = false;
let hasWarnedPeriodBaseCacheNamespaceFailure = false;

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

function getCacheEnvOrThrowWhenRedisAvailable(): string {
  const rawCacheEnv = process.env.PERIOD_BASE_CACHE_ENV?.trim();
  if (rawCacheEnv) {
    return rawCacheEnv;
  }

  if (!hasWarnedPeriodBaseCacheNamespaceFailure) {
    console.error(
      "PERIOD_BASE_CACHE_ENV must be set when Redis-backed period base-data cache is enabled.",
    );
    hasWarnedPeriodBaseCacheNamespaceFailure = true;
  }

  throw new Error(
    "PERIOD_BASE_CACHE_ENV must be set when Redis-backed period base-data cache is enabled.",
  );
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

function getPeriodBaseCacheGenerationKey(args: {
  cacheEnv: string;
  accountBookId: string;
}) {
  return `${PERIOD_BASE_CACHE_GENERATION_PREFIX}:${args.cacheEnv}:${args.accountBookId}`;
}

function isPresetPeriodValue(value: string): boolean {
  return (PERIOD_PRESET_VALUES as readonly string[]).includes(value);
}

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getInflightPeriodKey(periodValue: string): string {
  if (!isPresetPeriodValue(periodValue)) {
    return periodValue;
  }

  return `${periodValue}:${formatUtcDateKey(startOfUtcDay(new Date()))}`;
}

async function resolvePeriodBaseCachePeriodKey(args: {
  accountBookId: string;
  periodValue: string;
}): Promise<string> {
  if (!isPresetPeriodValue(args.periodValue)) {
    return args.periodValue;
  }

  // Month presets are independent of the account-book start date.
  // Derive keys directly so cache hits avoid an extra DB read.
  if (
    args.periodValue === PERIOD_PRESET_MTD ||
    args.periodValue === PERIOD_PRESET_LAST_MONTH
  ) {
    const selection = resolvePeriodSelection({
      periodValue: args.periodValue,
      now: new Date(),
    });

    return `${selection.granularity}:${formatUtcDateKey(selection.from)}:${formatUtcDateKey(selection.to)}`;
  }

  const accountBook = await prisma.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: {
      startDate: true,
    },
  });

  const selection = resolvePeriodSelection({
    periodValue: args.periodValue,
    now: new Date(),
    firstBookingDate: startOfUtcDay(accountBook.startDate),
  });

  return `${selection.granularity}:${formatUtcDateKey(selection.from)}:${formatUtcDateKey(selection.to)}`;
}

async function getPeriodBaseCacheGeneration(args: {
  cacheEnv: string;
  accountBookId: string;
  redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;
}): Promise<string> {
  const generationKey = getPeriodBaseCacheGenerationKey({
    cacheEnv: args.cacheEnv,
    accountBookId: args.accountBookId,
  });

  try {
    const generation = await args.redis.get(generationKey);
    if (generation && generation.trim().length > 0) {
      return generation.trim();
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

  return "0";
}

export async function getOrLoadPeriodBaseData(args: {
  accountBookId: string;
  period?: unknown;
}): Promise<PeriodBaseData> {
  const periodValue = normalizePeriodValue(args.period);
  const inflightPeriodKey = getInflightPeriodKey(periodValue);
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

    const cacheEnv = getCacheEnvOrThrowWhenRedisAvailable();
    const periodCacheKey = await resolvePeriodBaseCachePeriodKey({
      accountBookId: args.accountBookId,
      periodValue,
    });
    const generation = await getPeriodBaseCacheGeneration({
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
        await redis.setEx(entryKey, PERIOD_BASE_CACHE_TTL_SECONDS, serialized);
        await redis.sAdd(indexKey, entryKey);
        await redis.expire(indexKey, PERIOD_BASE_CACHE_TTL_SECONDS);
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

  const cacheEnv = getCacheEnvOrThrowWhenRedisAvailable();
  const generation = await getPeriodBaseCacheGeneration({
    cacheEnv,
    accountBookId,
    redis,
  });
  const indexKey = getPeriodBaseCacheIndexKey({
    cacheEnv,
    accountBookId,
    generation,
  });
  const generationKey = getPeriodBaseCacheGenerationKey({
    cacheEnv,
    accountBookId,
  });

  try {
    const members = await redis.sMembers(indexKey);
    if (members.length > 0) {
      await redis.del([...members, indexKey]);
    } else {
      await redis.del(indexKey);
    }
    const nextGeneration = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await redis.set(generationKey, nextGeneration);

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
