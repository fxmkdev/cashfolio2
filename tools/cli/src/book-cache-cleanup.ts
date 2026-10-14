import { getRestoreBookCacheKeyPatterns } from "../../../apps/cashfolio-app2/src/shared/book-cache-keys";

export type BookCacheRedisClient = {
  scanIterator(options: {
    MATCH: string;
    COUNT: number;
  }): AsyncIterable<string | string[]>;
  del(keys: string[]): Promise<number>;
};

const SCAN_COUNT = 100;
const DELETE_BATCH_SIZE = 100;

export async function deleteRestoreBookCaches(
  redis: BookCacheRedisClient,
): Promise<number> {
  let deletedCount = 0;
  for (const pattern of getRestoreBookCacheKeyPatterns()) {
    for await (const result of redis.scanIterator({
      MATCH: pattern,
      COUNT: SCAN_COUNT,
    })) {
      const keys = Array.isArray(result) ? result : [result];
      for (let offset = 0; offset < keys.length; offset += DELETE_BATCH_SIZE) {
        deletedCount += await redis.del(
          keys.slice(offset, offset + DELETE_BATCH_SIZE),
        );
      }
    }
  }
  return deletedCount;
}
