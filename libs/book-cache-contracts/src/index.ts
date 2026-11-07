// Cache namespaces and cleanup contracts shared by the app and operational tools.
export const PERIOD_BASE_CACHE_FAMILY = "period:base";
export const PERIOD_BASE_CACHE_INDEX_FAMILY = `${PERIOD_BASE_CACHE_FAMILY}:index`;
export const PERIOD_CACHE_GENERATION_FAMILY = `${PERIOD_BASE_CACHE_FAMILY}:generation`;
export const ACCOUNT_GAIN_LOSS_BASIS_CACHE_FAMILY = "account:gain-loss-basis";
export const ACCOUNT_GAIN_LOSS_CACHE_FAMILY = "account:gain-loss";
export const PERIOD_HISTORY_METRICS_CACHE_FAMILY = "period:history:metrics";

function getPeriodCacheCleanupPatterns(bookPattern: string): string[] {
  return [
    `${PERIOD_BASE_CACHE_FAMILY}:v*:*:${bookPattern}:*`,
    `${PERIOD_BASE_CACHE_INDEX_FAMILY}:v*:*:${bookPattern}:*`,
    `${PERIOD_CACHE_GENERATION_FAMILY}:v*:*:${bookPattern}`,
    `${PERIOD_HISTORY_METRICS_CACHE_FAMILY}:v*:*:${bookPattern}:*`,
    `${ACCOUNT_GAIN_LOSS_CACHE_FAMILY}:v*:*:${bookPattern}:*`,
    `${ACCOUNT_GAIN_LOSS_BASIS_CACHE_FAMILY}:v*:*:${bookPattern}:*`,
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
    ACCOUNT_GAIN_LOSS_BASIS_CACHE_FAMILY,
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
