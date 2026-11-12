import {
  PERIOD_BASE_CACHE_FAMILY,
  PERIOD_BASE_CACHE_INDEX_FAMILY,
  PERIOD_CACHE_GENERATION_FAMILY,
  ACCOUNT_GAIN_LOSS_BASIS_CACHE_FAMILY,
  ACCOUNT_GAIN_LOSS_CACHE_FAMILY,
  PERIOD_HISTORY_METRICS_CACHE_FAMILY,
  ACCOUNT_RETURN_CACHE_FAMILY,
  ACCOUNT_RETURN_WORK_FAMILY,
} from "@cashfolio/book-cache-contracts";

// Cache payload versions and key builders remain owned by the app.
export const PERIOD_BASE_CACHE_ENTRY_PREFIX = `${PERIOD_BASE_CACHE_FAMILY}:v12`;
export const PERIOD_BASE_CACHE_INDEX_PREFIX = `${PERIOD_BASE_CACHE_INDEX_FAMILY}:v12`;
export const PERIOD_CACHE_GENERATION_PREFIX = `${PERIOD_CACHE_GENERATION_FAMILY}:v1`;
export const PERIOD_HISTORY_METRICS_CACHE_ENTRY_PREFIX = `${PERIOD_HISTORY_METRICS_CACHE_FAMILY}:v15`;

type BookCacheScope = { cacheEnv: string; accountBookId: string };
type BookCacheGenerationScope = BookCacheScope & { generation: string };

export function getPeriodBaseCacheEntryKey(
  args: BookCacheGenerationScope & { periodCacheKey: string },
): string {
  return `${PERIOD_BASE_CACHE_ENTRY_PREFIX}:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.periodCacheKey}`;
}

export function getPeriodBaseCacheIndexKey(
  args: BookCacheGenerationScope,
): string {
  return `${PERIOD_BASE_CACHE_INDEX_PREFIX}:${args.cacheEnv}:${args.accountBookId}:${args.generation}`;
}

export function getPeriodCacheGenerationKey(args: BookCacheScope): string {
  return `${PERIOD_CACHE_GENERATION_PREFIX}:${args.cacheEnv}:${args.accountBookId}`;
}

export function getHistoryMetricsCacheEntryKey(
  args: BookCacheGenerationScope & { periodCacheKey: string; scopeKey: string },
): string {
  return `${PERIOD_HISTORY_METRICS_CACHE_ENTRY_PREFIX}:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.periodCacheKey}:${args.scopeKey}`;
}

export function getAccountGainLossCacheEntryKey(
  args: BookCacheGenerationScope & {
    asOfDate: string;
    latestFetchableDate: string;
  },
): string {
  return `${ACCOUNT_GAIN_LOSS_CACHE_FAMILY}:v5:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.asOfDate}:${args.latestFetchableDate}`;
}

export function getAccountGainLossBasisCacheEntryKey(
  args: BookCacheGenerationScope & { watermark: string },
): string {
  return `${ACCOUNT_GAIN_LOSS_BASIS_CACHE_FAMILY}:v4:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.watermark}`;
}

export function getAccountReturnCacheEntryKey(
  args: BookCacheGenerationScope & {
    asOfDate: string;
    latestFetchableDate: string;
    scopeKey: string;
  },
): string {
  return `${ACCOUNT_RETURN_CACHE_FAMILY}:v4:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.asOfDate}:${args.latestFetchableDate}:${args.scopeKey}`;
}

export function getAccountReturnWorkKey(
  args: BookCacheScope & { userId: string; id: string },
): string {
  return `${ACCOUNT_RETURN_WORK_FAMILY}:v4:${args.cacheEnv}:${args.accountBookId}:${args.userId}:${args.id}`;
}
