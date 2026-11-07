import { getRedisClient } from "../../../redis.server";
import { getAccountReturnCacheEntryKey } from "../../../shared/book-cache-keys";
import type {
  AccountReturnResult,
  AccountReturnScope,
  AccountReturnSummaries,
} from "../../../shared/account-returns";
import {
  createCacheFailureReporter,
  readValidatedMoneyCache,
} from "../../money-cache-read";
import {
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../../resource-context.server";
import {
  PERIOD_CACHE_TTL_SECONDS,
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
  formatUtcDateKey,
} from "../../period/cache/period-cache";
import { createValuationLookupContext } from "../../valuation/lookup-context";
import { startOfUtcDay } from "../../../shared/date";

const MAX_BYTES = 512 * 1024;
const shared = createUserScopedSharedWork<AccountReturnSummaries>();
const reportRead = createCacheFailureReporter(
  "Failed to read account returns cache; continuing uncached.",
);
const reportWrite = createCacheFailureReporter(
  "Failed to write account returns cache; continuing uncached.",
);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const date = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const rate = (value: unknown) =>
  value === null ||
  (typeof value === "number" && Number.isFinite(value) && value >= -1);
export function isAccountReturnResult(
  value: unknown,
): value is AccountReturnResult {
  return (
    record(value) &&
    typeof value.applicable === "boolean" &&
    [value.twr, value.mwr, value.annualizedTwr, value.annualizedMwr].every(
      rate,
    ) &&
    (value.effectiveStartDate === null || date(value.effectiveStartDate)) &&
    (value.effectiveEndDate === null || date(value.effectiveEndDate)) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(
      (item: unknown) =>
        record(item) &&
        ["both", "twr", "mwr"].includes(String(item.metric)) &&
        typeof item.message === "string" &&
        (item.date === undefined || date(item.date)),
    )
  );
}
export function isAccountReturnSummaries(
  value: unknown,
): value is AccountReturnSummaries {
  return (
    record(value) &&
    typeof value.referenceCurrency === "string" &&
    date(value.startDate) &&
    date(value.asOfDate) &&
    isAccountReturnResult(value.total) &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (item: unknown) =>
        record(item) &&
        typeof item.id === "string" &&
        isAccountReturnResult(item),
    )
  );
}

export async function getOrLoadAccountReturnSummaries(
  scope: AccountReturnScope,
  load: () => Promise<{
    data: AccountReturnSummaries;
    revision: string;
    cacheable: boolean;
    expiresAt?: number;
  }>,
): Promise<AccountReturnSummaries> {
  const asOfDate = formatUtcDateKey(startOfUtcDay(new Date()));
  const publication = formatUtcDateKey(
    createValuationLookupContext().latestFetchableDate,
  );
  const redis = await getRedisClient();
  if (!redis) return (await load()).data;
  const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
  const generation = await getPeriodCacheGeneration({
    accountBookId: scope.accountBookId,
  });
  if (generation === null) return (await load()).data;
  const key = getAccountReturnCacheEntryKey({
    cacheEnv,
    accountBookId: scope.accountBookId,
    generation,
    asOfDate,
    latestFetchableDate: publication,
    scopeKey: `${scope.grouping}:${scope.accountState}`,
  });
  return shared(key, async () => {
    const cached = await readValidatedMoneyCache({
      read: () => redis.get(key),
      maxBytes: MAX_BYTES,
      validate: (value: unknown): value is AccountReturnSummaries =>
        isAccountReturnSummaries(value) && value.asOfDate === asOfDate,
      reportFailure: reportRead,
    });
    if (cached) return cached;
    const result = await load();
    if (
      !result.cacheable ||
      result.revision !== generation ||
      result.data.asOfDate !== asOfDate ||
      (await getPeriodCacheGeneration({
        accountBookId: scope.accountBookId,
      })) !== generation ||
      formatUtcDateKey(createValuationLookupContext().latestFetchableDate) !==
        publication
    )
      return result.data;
    try {
      const serialized = JSON.stringify(result.data);
      if (Buffer.byteLength(serialized, "utf8") <= MAX_BYTES) {
        checkResourceBudget();
        const ttl = Math.min(
          PERIOD_CACHE_TTL_SECONDS,
          Math.floor(
            ((result.expiresAt ??
              Date.now() + PERIOD_CACHE_TTL_SECONDS * 1000) -
              Date.now()) /
              1000,
          ),
        );
        if (ttl > 0) await redis.setEx(key, ttl, serialized);
      }
    } catch (error) {
      reportWrite(error);
    }
    return result.data;
  });
}
