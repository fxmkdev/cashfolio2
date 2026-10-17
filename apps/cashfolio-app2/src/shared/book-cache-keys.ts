// Keep key versions and cleanup families together. This module must stay free
// of app/runtime dependencies so operational tools can consume the same keys.
const PERIOD_BASE_CACHE_FAMILY = "period:base";
const PERIOD_BASE_CACHE_INDEX_FAMILY = `${PERIOD_BASE_CACHE_FAMILY}:index`;
const PERIOD_CACHE_GENERATION_FAMILY = `${PERIOD_BASE_CACHE_FAMILY}:generation`;
const ACCOUNT_GAIN_LOSS_CACHE_FAMILY = "account:gain-loss";
const PERIOD_HISTORY_METRICS_CACHE_FAMILY = "period:history:metrics";

export const PERIOD_BASE_CACHE_ENTRY_PREFIX = `${PERIOD_BASE_CACHE_FAMILY}:v8`;
export const PERIOD_BASE_CACHE_INDEX_PREFIX = `${PERIOD_BASE_CACHE_INDEX_FAMILY}:v8`;
export const PERIOD_CACHE_GENERATION_PREFIX = `${PERIOD_CACHE_GENERATION_FAMILY}:v1`;
export const PERIOD_HISTORY_METRICS_CACHE_ENTRY_PREFIX = `${PERIOD_HISTORY_METRICS_CACHE_FAMILY}:v6`;

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
  return `${ACCOUNT_GAIN_LOSS_CACHE_FAMILY}:v1:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.asOfDate}:${args.latestFetchableDate}`;
}

function getPeriodCacheCleanupPatterns(bookPattern: string): string[] {
  return [
    `${PERIOD_BASE_CACHE_FAMILY}:v*:*:${bookPattern}:*`,
    `${PERIOD_BASE_CACHE_INDEX_FAMILY}:v*:*:${bookPattern}:*`,
    `${PERIOD_CACHE_GENERATION_FAMILY}:v*:*:${bookPattern}`,
    `${PERIOD_HISTORY_METRICS_CACHE_FAMILY}:v*:*:${bookPattern}:*`,
    `${ACCOUNT_GAIN_LOSS_CACHE_FAMILY}:v*:*:${bookPattern}:*`,
  ];
}

export function getBookScopedRedisKeyPatterns(accountBookId: string): string[] {
  const literalBookId = accountBookId.replace(/[\\*?[\]]/g, "\\$&");
  return getPeriodCacheCleanupPatterns(literalBookId);
}

/** Redis glob wildcards also span colons; verify the book's actual key segment. */
export function isBookScopedPeriodCacheKey(
  key: string,
  accountBookId: string,
): boolean {
  return [
    PERIOD_BASE_CACHE_FAMILY,
    PERIOD_BASE_CACHE_INDEX_FAMILY,
    PERIOD_CACHE_GENERATION_FAMILY,
    PERIOD_HISTORY_METRICS_CACHE_FAMILY,
    ACCOUNT_GAIN_LOSS_CACHE_FAMILY,
  ].some((family) => {
    const prefix = `${family}:`;
    if (!key.startsWith(prefix)) return false;
    const [version, , bookId] = key.slice(prefix.length).split(":");
    return /^v[0-9]+$/.test(version ?? "") && bookId === accountBookId;
  });
}

/** All book caches on the dedicated restore Redis, preserving global valuation. */
export function getRestoreBookCacheKeyPatterns(): string[] {
  return ["account-book:*", ...getPeriodCacheCleanupPatterns("*")];
}
