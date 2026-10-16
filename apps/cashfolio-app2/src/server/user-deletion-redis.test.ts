import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  scanIterator: vi.fn(),
  del: vi.fn(),
}));

const getRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/redis.server", () => ({
  getRedisClient,
}));

import { deleteBookScopedRedisDataForAccountBooks } from "./user-deletion-redis";

async function* scanResult(keys: string[]) {
  if (keys.length > 0) {
    yield keys;
  }
}

describe("deleteBookScopedRedisDataForAccountBooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";
    getRedisClient.mockResolvedValue(redis);
    redis.scanIterator.mockImplementation(({ MATCH }: { MATCH: string }) => {
      return scanResult([`${MATCH}:key-1`, `${MATCH}:key-2`]);
    });
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("skips cleanup when Redis is not configured", async () => {
    delete process.env.REDIS_URL;

    await deleteBookScopedRedisDataForAccountBooks(["book-1"]);

    expect(getRedisClient).not.toHaveBeenCalled();
    expect(redis.scanIterator).not.toHaveBeenCalled();
  });

  it("continues when Redis is configured but unavailable", async () => {
    getRedisClient.mockResolvedValue(null);

    await expect(
      deleteBookScopedRedisDataForAccountBooks(["book-1"]),
    ).resolves.toBeUndefined();

    expect(redis.scanIterator).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("continues when Redis cleanup fails", async () => {
    redis.scanIterator.mockImplementation(() => {
      throw new Error("scan failed");
    });

    await expect(
      deleteBookScopedRedisDataForAccountBooks(["book-1"]),
    ).resolves.toBeUndefined();
  });

  it("deletes only requested books across versions, environments and scan pages", async () => {
    const target = [
      "period:base:v1:local:book-1:revision:2026-01",
      "period:base:v8:preview:book-1:revision:2026-01",
      "period:base:v99:local:book-1:revision:2026-01",
      "period:base:index:v99:local:book-1:revision",
      "period:base:generation:v99:local:book-1",
      "period:history:metrics:v99:preview:book-1:revision:2026-01:total",
      "period:base:v8:local:book-2:revision:2026-01",
    ];
    const preserved = [
      "period:base:v8:local:book-10:revision:2026-01",
      "period:history:metrics:v6:local:book-3:revision:2026-01:total",
      "period:history:metrics:v6:local:book-3:revision:2026-01:scope:book-1:child",
      "valuation:currencylayer:USD:CHF",
      "session:user-1",
    ];
    const keys = new Set([...target, ...preserved]);
    redis.scanIterator.mockImplementation(async function* ({ MATCH }) {
      const regex = MATCH.split("*")
        .map((part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      yield [];
      for (const key of [...keys])
        if (new RegExp(`^${regex}$`).test(key)) yield [key];
    });
    redis.del.mockImplementation(async (batch: string[]) => {
      let count = 0;
      for (const key of batch) if (keys.delete(key)) count++;
      return count;
    });

    await deleteBookScopedRedisDataForAccountBooks([
      "book-1",
      "book-2",
      "book-1",
    ]);
    expect([...keys]).toEqual(preserved);
    expect(redis.scanIterator).toHaveBeenCalledTimes(8);
    for (const [options] of redis.scanIterator.mock.calls)
      expect(options.COUNT).toBe(100);
  });
});
