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
  createdAt: Date.now(),
  binding: "binding",
  revision: "r1",
  asOfDate: "2026-11-07",
  publication: "2026-11-06",
  context: "context",
  planId: "plan",
  phase: "history",
  done: [],
  failures: {},
  validUntil: Date.parse("2026-11-08T00:00:00Z"),
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
    expire: vi.fn(),
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
    "account:returns-work:v4:test:redis-book:user:0",
    900,
    expect.any(String),
  );
  entries.set(
    "account:returns-work:v4:test:redis-book:user:0",
    '{"phase":"invalid"}',
  );
  expect(await store.read("0")).toBeUndefined();
  await store.remove("1");
  expect(await store.read("1")).toBeUndefined();
});
it("retains newer local progress across stale Redis data, failed writes and a Redis outage", async () => {
  let encoded: string | null = null;
  const redis = {
    expire: vi.fn(),
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
  progress.phase = "calculation";
  redis.setEx.mockRejectedValueOnce(new Error("Redis unavailable"));
  await store.save("job", progress);
  expect(await store.read("job")).toMatchObject({
    phase: "calculation",
    sequence: 2,
  });
  mocks.redis.mockResolvedValue(null);
  expect(
    await (await returnWorkStore("outage-book", "user")).read("job"),
  ).toMatchObject({ phase: "calculation", sequence: 2 });
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
it("shares an indexed job between concurrent tabs and serializes its advancement", async () => {
  const store = await returnWorkStore("tabs-book", "user");
  const ids = await Promise.all([
    store.indexed("scope", "first"),
    store.indexed("scope", "second"),
  ]);
  expect(ids).toEqual(["first", "first"]);
  const release = await store.lease("first");
  expect(release).toBeTypeOf("function");
  expect(await store.lease("first")).toBeUndefined();
  await release!();
  const again = await store.lease("first");
  expect(again).toBeTypeOf("function");
  await again!();
  await store.invalidate("scope", "first");
  expect(await store.indexed("scope", "third")).toBe("third");
});
it("returns independent checkpoint objects to concurrent readers", async () => {
  const store = await returnWorkStore("immutable-book", "user");
  await store.save("job", state());
  const a = await store.read("job"),
    b = await store.read("job");
  a!.done.push("new");
  expect(b!.done).toEqual([]);
  expect((await store.read("job"))!.done).toEqual([]);
});
it("uses the production read/write-only Redis ACL and safely releases only its own lease token", async () => {
  const lists = new Map<string, string[]>();
  const strings = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
      strings.set(key, value);
    }),
    lPush: vi.fn(async (key: string, value: string) => {
      lists.set(key, [value, ...(lists.get(key) ?? [])]);
    }),
    lIndex: vi.fn(async (key: string) => lists.get(key)?.at(-1) ?? null),
    lRem: vi.fn(async (key: string, _count: number, value: string) => {
      lists.set(
        key,
        (lists.get(key) ?? []).filter((v) => v !== value),
      );
    }),
    expire: vi.fn(),
    eval: vi.fn(() => {
      throw new Error("NOPERM eval");
    }),
  };
  mocks.redis.mockResolvedValue(redis);
  const store = await returnWorkStore("acl-book", "user");
  expect(
    await Promise.all([
      store.indexed("context", "first"),
      store.indexed("context", "second"),
    ]),
  ).toEqual(["first", "first"]);
  const release = await store.lease("first");
  expect(release).toBeTypeOf("function");
  await release!();
  expect(
    [...lists.values()].every(
      (list) => !list.some((value) => value.includes('"expires"')),
    ),
  ).toBe(true);
  // An abandoned token expires independently of a newer owner's token.
  const leaseKey = "account:returns-work:v4:test:acl-book:user:lease:first";
  lists.set(leaseKey, [
    JSON.stringify({ id: "abandoned", expires: Date.now() - 1 }),
  ]);
  const next = await store.lease("first");
  expect(next).toBeTypeOf("function");
  const otherToken = JSON.stringify({
    id: "newer",
    expires: Date.now() + 100000,
  });
  lists.set(leaseKey, [otherToken, ...lists.get(leaseKey)!]);
  await next!();
  expect(lists.get(leaseKey)).toEqual([otherToken]);
  await store.invalidate("context", "first");
  expect(await store.indexed("context", "third")).toBe("third");
  expect(redis.eval).not.toHaveBeenCalled();
});
