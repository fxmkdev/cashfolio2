import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redis: vi.fn() }));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../period/cache/period-cache", () => ({
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
}));
import {
  returnWorkStore,
  type ReturnWorkState,
} from "./return-work-store.server";
const state = (): ReturnWorkState => ({
  sequence: 0,
  binding: "binding",
  revision: "r1",
  asOfDate: "2026-11-07",
  publication: "2026-11-06",
  referenceCurrency: "CHF",
  phase: "capital",
  requests: [],
  offset: 0,
  rates: {},
  results: [],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00Z"));
  mocks.redis.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("uses Redis checkpoints across local eviction and rejects corrupt data", async () => {
  const entries = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key) => entries.get(key) ?? null),
    setEx: vi.fn(async (key, _ttl, encoded) => {
      entries.set(key, encoded);
    }),
    del: vi.fn(async (key) => entries.delete(key)),
  };
  mocks.redis.mockResolvedValue(redis);
  const store = await returnWorkStore("redis-book", "user");
  for (let i = 0; i < 18; i++) await store.save(String(i), state());
  expect(await store.read("0")).toMatchObject({ revision: "r1", sequence: 1 });
  expect(redis.setEx).toHaveBeenCalledWith(
    "account:returns-work:v2:test:redis-book:user:0",
    900,
    expect.any(String),
  );
  entries.set(
    "account:returns-work:v2:test:redis-book:user:0",
    '{"phase":"invalid"}',
  );
  expect(await store.read("0")).toBeUndefined();
  await store.remove("1");
  expect(await store.read("1")).toBeUndefined();
});
it("retains newer local progress across stale Redis data, failed writes and a Redis outage", async () => {
  let encoded: string | null = null;
  const redis = {
    get: vi.fn(async () => encoded),
    setEx: vi.fn(async (_key, _ttl, data) => {
      encoded = data;
    }),
    del: vi.fn(),
  };
  mocks.redis.mockResolvedValue(redis);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const store = await returnWorkStore("outage-book", "user");
  const progress = state();
  await store.save("job", progress);
  progress.phase = "valuation";
  redis.setEx.mockRejectedValueOnce(new Error("Redis unavailable"));
  await store.save("job", progress);
  expect(await store.read("job")).toMatchObject({
    phase: "valuation",
    sequence: 2,
  });
  mocks.redis.mockResolvedValue(null);
  expect(
    await (await returnWorkStore("outage-book", "user")).read("job"),
  ).toMatchObject({ phase: "valuation", sequence: 2 });
  expect(
    await (await returnWorkStore("outage-book", "other-user")).read("job"),
  ).toBeUndefined();
  vi.advanceTimersByTime(901_000);
  expect(
    await (await returnWorkStore("outage-book", "user")).read("job"),
  ).toBeUndefined();
});
it("bounds the local fallback and rejects oversized checkpoints", async () => {
  const store = await returnWorkStore("bounded-book", "user");
  for (let i = 0; i < 18; i++) await store.save(String(i), state());
  expect(await store.read("0")).toBeUndefined();
  await expect(
    store.save("oversized", {
      ...state(),
      binding: "x".repeat(8 * 1024 * 1024),
    }),
  ).rejects.toThrow("checkpoint size");
});
