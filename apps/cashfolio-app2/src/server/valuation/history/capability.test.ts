import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redis: vi.fn(), key: vi.fn() }));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../provider-api-key", () => ({ getProviderApiKey: mocks.key }));
import { historyCapability } from "./capability";
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07Z"));
  mocks.key.mockResolvedValue("private-key");
});
afterEach(() => vi.useRealTimers());
it("remembers explicit subscription restrictions by key fingerprint without exposing API keys", async () => {
  const redis = { get: vi.fn().mockResolvedValue(null), setEx: vi.fn() };
  mocks.redis.mockResolvedValue(redis);
  const first = await historyCapability("MARKETSTACK");
  expect(first.supported).toBeUndefined();
  await first.set(false);
  expect((await historyCapability("MARKETSTACK")).supported).toBe(false);
  expect(redis.setEx).toHaveBeenCalledWith(
    expect.not.stringContaining("private-key"),
    86400,
    "no",
  );
  mocks.key.mockResolvedValue("changed-key");
  expect((await historyCapability("MARKETSTACK")).supported).toBeUndefined();
  redis.get.mockResolvedValue("yes");
  expect((await historyCapability("COINLAYER")).supported).toBe(true);
});
it("expires local restrictions and falls back safely without Redis", async () => {
  mocks.redis.mockResolvedValue(null);
  mocks.key.mockResolvedValue("outage-key");
  const first = await historyCapability("CURRENCYLAYER");
  await first.set(false);
  expect((await historyCapability("CURRENCYLAYER")).supported).toBe(false);
  vi.advanceTimersByTime(86400_001);
  expect((await historyCapability("CURRENCYLAYER")).supported).toBeUndefined();
});
