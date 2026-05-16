import { getRedisClient } from "@/redis.server";

const BOOK_SCOPED_REDIS_KEY_PATTERNS = [
  "period:base:v1:*:{accountBookId}:*",
  "period:base:index:v1:*:{accountBookId}:*",
  "period:base:generation:v1:*:{accountBookId}",
  "period:timeline:metrics:v1:*:{accountBookId}:*",
] as const;

function getBookScopedRedisKeyPatterns(accountBookId: string): string[] {
  return BOOK_SCOPED_REDIS_KEY_PATTERNS.map((pattern) =>
    pattern.replace("{accountBookId}", accountBookId),
  );
}

function hasRedisUrlConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

async function deleteKeysForPattern(
  redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
  pattern: string,
) {
  for await (const scanResult of redis.scanIterator({
    MATCH: pattern,
    COUNT: 100,
  })) {
    const keys = Array.isArray(scanResult) ? scanResult : [scanResult];
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

  const redis = await getRedisClient();
  if (!redis) {
    throw new Error("Redis is configured but unavailable.");
  }

  const uniqueAccountBookIds = Array.from(new Set(accountBookIds));
  for (const accountBookId of uniqueAccountBookIds) {
    const patterns = getBookScopedRedisKeyPatterns(accountBookId);
    for (const pattern of patterns) {
      await deleteKeysForPattern(redis, pattern);
    }
  }
}
