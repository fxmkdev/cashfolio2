import {
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../resource-context.server";
import { rethrowResourceError } from "../resource-error";
import { getRedisClient } from "../../redis.server";
import { startOfUtcDay } from "../../shared/date";
import { getAccountGainLossCacheEntryKey } from "../../shared/book-cache-keys";
import { decodeMoneyCache, encodeMoneyCache } from "../money-cache-codec";
import {
  PERIOD_CACHE_TTL_SECONDS,
  formatUtcDateKey,
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
} from "../period/cache/period-cache";
import { createValuationLookupContext } from "../valuation/lookup-context";
import { loadAccountGainLossSummaryRange } from "./account-gain-loss-basis-cache.server";
import {
  type AccountGainLossCacheData,
  isAccountGainLossCacheData,
  toAccountGainLossCacheData,
} from "./account-gain-loss-cache-data";

const MAX_SERIALIZED_BYTES = 512 * 1024;
const runSharedLoad = createUserScopedSharedWork<AccountGainLossCacheData>();
let hasWarnedReadFailure = false;
let hasWarnedWriteFailure = false;

export async function getOrLoadAccountGainLossSummaries(
  accountBookId: string,
): Promise<AccountGainLossCacheData> {
  const now = new Date();
  const asOfDate = startOfUtcDay(now);
  const latestFetchableDate =
    createValuationLookupContext(now).latestFetchableDate;
  const load = () =>
    loadAccountGainLossSummaryRange({ accountBookId, asOfDate });
  const redis = await getRedisClient();
  if (!redis) return toAccountGainLossCacheData(await load());

  const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
  const generation = await getPeriodCacheGeneration({ accountBookId });
  if (generation === null) return toAccountGainLossCacheData(await load());

  const cacheKey = getAccountGainLossCacheEntryKey({
    cacheEnv,
    accountBookId,
    generation,
    asOfDate: formatUtcDateKey(asOfDate),
    latestFetchableDate: formatUtcDateKey(latestFetchableDate),
  });
  return runSharedLoad(cacheKey, async () => {
    try {
      const cached = await redis.get(cacheKey);
      if (cached && Buffer.byteLength(cached, "utf8") <= MAX_SERIALIZED_BYTES) {
        const parsed = decodeMoneyCache<unknown>(JSON.parse(cached));
        if (
          isAccountGainLossCacheData(parsed) &&
          parsed.asOfDate === asOfDate.toISOString()
        )
          return parsed;
      }
    } catch (error) {
      rethrowResourceError(error);
      if (!hasWarnedReadFailure) {
        console.warn(
          "Failed to read account G/L cache; continuing uncached.",
          error,
        );
        hasWarnedReadFailure = true;
      }
    }

    const range = await load();
    const data = toAccountGainLossCacheData(range);
    if (
      !range.cacheableFromPermanentValuationCache ||
      range.revision !== generation ||
      (await getPeriodCacheGeneration({ accountBookId })) !== generation ||
      createValuationLookupContext().latestFetchableDate.getTime() !==
        latestFetchableDate.getTime()
    )
      return data;

    try {
      const serialized = JSON.stringify(encodeMoneyCache(data));
      if (Buffer.byteLength(serialized, "utf8") <= MAX_SERIALIZED_BYTES) {
        checkResourceBudget();
        await redis.setEx(cacheKey, PERIOD_CACHE_TTL_SECONDS, serialized);
      }
    } catch (error) {
      rethrowResourceError(error);
      if (!hasWarnedWriteFailure) {
        console.warn(
          "Failed to write account G/L cache; continuing uncached.",
          error,
        );
        hasWarnedWriteFailure = true;
      }
    }
    return data;
  });
}
