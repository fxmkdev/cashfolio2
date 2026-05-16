import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  scanIterator: vi.fn(),
  del: vi.fn(),
}));

const getRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/redis.server", () => ({
  getRedisClient,
}));

import { deleteBookScopedRedisDataForAccountBooks } from "./account-deletion-redis";

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

  it("throws when Redis is configured but unavailable", async () => {
    getRedisClient.mockResolvedValue(null);

    await expect(
      deleteBookScopedRedisDataForAccountBooks(["book-1"]),
    ).rejects.toThrow("Redis is configured but unavailable.");
  });

  it("scans and deletes all book-scoped period cache families", async () => {
    await deleteBookScopedRedisDataForAccountBooks(["book-1"]);

    expect(redis.scanIterator).toHaveBeenCalledWith({
      MATCH: "period:base:v1:*:book-1:*",
      COUNT: 100,
    });
    expect(redis.scanIterator).toHaveBeenCalledWith({
      MATCH: "period:base:index:v1:*:book-1:*",
      COUNT: 100,
    });
    expect(redis.scanIterator).toHaveBeenCalledWith({
      MATCH: "period:base:generation:v1:*:book-1",
      COUNT: 100,
    });
    expect(redis.scanIterator).toHaveBeenCalledWith({
      MATCH: "period:timeline:metrics:v1:*:book-1:*",
      COUNT: 100,
    });
    expect(redis.del).toHaveBeenCalledTimes(4);
  });
});
