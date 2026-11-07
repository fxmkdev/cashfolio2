import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
const mocks = vi.hoisted(() => ({ redis: vi.fn() }));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../period/cache/period-cache", () => ({
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
}));
import { returnArtifacts } from "./return-artifacts.server";
const valid = (v: unknown): v is { value: string } =>
  !!v && typeof v === "object" && "value" in v && typeof v.value === "string";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00Z"));
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("keeps immutable artifacts outside small checkpoints and never extends dependency expiry", async () => {
  const redis = { get: vi.fn(), pTTL: vi.fn(), setEx: vi.fn() };
  mocks.redis.mockResolvedValue(redis);
  const cache = await returnArtifacts("artifact-book");
  await cache.save(
    "item",
    { value: "ok", amount: toMoney("0.123456789012345678901") },
    Date.now() + 120_000,
  );
  expect(redis.setEx).toHaveBeenCalledWith(
    expect.stringContaining("artifact:item"),
    120,
    expect.stringContaining("0.123456789012345678901"),
  );
  expect(await cache.read("item", valid)).toMatchObject({ value: "ok" });
  expect(redis.get).not.toHaveBeenCalled();
  vi.advanceTimersByTime(120_001);
  redis.get.mockResolvedValue(null);
  redis.pTTL.mockResolvedValue(-2);
  expect(await cache.read("item", valid)).toBeUndefined();
  await cache.save("expired", { value: "no" }, Date.now() - 1);
  expect(redis.setEx).toHaveBeenCalledTimes(1);
});
it("validates Redis payloads and TTL and tolerates unavailable or corrupt Redis", async () => {
  const redis = {
    get: vi.fn().mockResolvedValue('{"value":"cached"}'),
    pTTL: vi.fn().mockResolvedValue(1000),
    setEx: vi.fn(),
  };
  mocks.redis.mockResolvedValue(redis);
  const cache = await returnArtifacts("remote-artifacts");
  expect(await cache.read("valid", valid)).toEqual({ value: "cached" });
  redis.get.mockResolvedValue('{"value":3}');
  expect(await cache.read("invalid", valid)).toBeUndefined();
  redis.get.mockResolvedValue('{"value":"expired"}');
  redis.pTTL.mockResolvedValue(-1);
  expect(await cache.read("expired", valid)).toBeUndefined();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  redis.get.mockRejectedValue(new Error("offline"));
  expect(await cache.read("offline", valid)).toBeUndefined();
  redis.setEx.mockRejectedValue(new Error("offline"));
  await cache.save("fallback", { value: "local" }, Date.now() + 10000);
  expect(await cache.read("fallback", valid)).toEqual({ value: "local" });
  await expect(
    cache.save(
      "huge",
      { value: "x".repeat(8 * 1024 * 1024) },
      Date.now() + 1000,
    ),
  ).rejects.toThrow("artifact size");
});
