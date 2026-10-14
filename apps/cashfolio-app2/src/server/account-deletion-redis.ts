import {
  getBookScopedRedisKeyPatterns,
  isBookScopedPeriodCacheKey,
} from "../shared/book-cache-keys";
import { getRedisClient } from "@/redis.server";

let hasWarnedAccountDeletionRedisCleanupFailure = false;

function hasRedisUrlConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

async function deleteKeysForPattern(
  redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
  pattern: string,
  accountBookId: string,
) {
  for await (const scanResult of redis.scanIterator({
    MATCH: pattern,
    COUNT: 100,
  })) {
    const keys = (Array.isArray(scanResult) ? scanResult : [scanResult]).filter(
      (key) => isBookScopedPeriodCacheKey(key, accountBookId),
    );
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
}

export async function deleteBookScopedRedisDataForAccountBooks(
  accountBookIds: string[],
): Promise<void> {
  if (accountBookIds.length === 0 || !hasRedisUrlConfigured()) {
    return;
  }

  try {
    const redis = await getRedisClient();
    if (!redis) {
      if (!hasWarnedAccountDeletionRedisCleanupFailure) {
        console.warn(
          "Redis is configured but unavailable; continuing account deletion without book-scoped Redis cleanup.",
        );
        hasWarnedAccountDeletionRedisCleanupFailure = true;
      }
      return;
    }

    const uniqueAccountBookIds = Array.from(new Set(accountBookIds));
    for (const accountBookId of uniqueAccountBookIds) {
      const patterns = getBookScopedRedisKeyPatterns(accountBookId);
      for (const pattern of patterns) {
        await deleteKeysForPattern(redis, pattern, accountBookId);
      }
    }
  } catch (error) {
    if (!hasWarnedAccountDeletionRedisCleanupFailure) {
      console.warn(
        "Failed to delete book-scoped Redis data during account deletion; continuing account deletion.",
        error,
      );
      hasWarnedAccountDeletionRedisCleanupFailure = true;
    }
  }
}
