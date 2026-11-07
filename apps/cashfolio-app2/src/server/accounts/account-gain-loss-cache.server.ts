import {
  createCacheFailureReporter,
  readValidatedMoneyCache,
} from "../money-cache-read";
import {
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../resource-context.server";
import { getRedisClient } from "../../redis.server";
import { startOfUtcDay } from "../../shared/date";
import { getAccountGainLossCacheEntryKey } from "../../shared/book-cache-keys";
import { encodeMoneyCache } from "../money-cache-codec";
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
const reportReadFailure = createCacheFailureReporter(
  "Failed to read account G/L cache; continuing uncached.",
);
const reportWriteFailure = createCacheFailureReporter(
  "Failed to write account G/L cache; continuing uncached.",
);

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
    const cached = await readValidatedMoneyCache({
      read: () => redis.get(cacheKey),
      maxBytes: MAX_SERIALIZED_BYTES,
      validate: (value: unknown): value is AccountGainLossCacheData =>
        isAccountGainLossCacheData(value) &&
        value.asOfDate === asOfDate.toISOString(),
      reportFailure: reportReadFailure,
    });
    if (cached !== undefined) return cached;

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
      reportWriteFailure(error);
    }
    return data;
  });
}
