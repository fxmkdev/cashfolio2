import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import { ResourceLimitError } from "../../resource-error";
const mocks = vi.hoisted(() => ({ redis: vi.fn() }));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../period/cache/period-cache.server", () => ({
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
}));
import { returnArtifacts } from "./return-artifacts.server";
import { artifactRedis } from "./return-artifact-test-support";
const valid = (v: unknown): v is { value: string } =>
  !!v && typeof v === "object" && "value" in v && typeof v.value === "string";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00Z"));
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function remoteReader(book: string) {
  vi.resetModules();
  return (await import("./return-artifacts.server")).returnArtifacts(book);
}
it("publishes chunks before the manifest and never extends absolute dependency expiry", async () => {
  const { redis, entries } = artifactRedis();
  mocks.redis.mockResolvedValue(redis);
  const cache = await returnArtifacts("expiry");
  const expires = Date.now() + 120_000;
  await cache.save(
    "item",
    { value: "ok", amount: toMoney("0.123456789012345678901") },
    expires,
  );
  const keys = [...entries.keys()];
  expect(keys).toHaveLength(2);
  expect(keys[0]).toContain(":chunk:");
  expect(keys[1]).toMatch(/artifact:chunks-v1:item$/);
  expect([...entries.values()].every((e) => e.expires === expires)).toBe(true);
  expect(await cache.read("item", valid)).toMatchObject({ value: "ok" });
  expect(redis.get).not.toHaveBeenCalled();
  vi.advanceTimersByTime(120_001);
  expect(await cache.read("item", valid)).toBeUndefined();
  await cache.save("expired", { value: "no" }, Date.now() - 1);
  expect(redis.set).toHaveBeenCalledTimes(2);
});
it("round-trips a snapshot larger than 10 MiB on another instance with bounded UTF-8 chunks", async () => {
  const { redis, entries } = artifactRedis();
  mocks.redis.mockResolvedValue(redis);
  const cache = await returnArtifacts("large");
  const value = {
    value: "🚀é\ud800".repeat(1_200_000),
    amount: toMoney("123456.123456789012345678901"),
    date: new Date("2026-02-03Z"),
    nested: [{ a: "b" }, null, undefined],
  };
  await cache.save("item", value, Date.now() + 120_000);
  expect(
    [...entries.values()].every(
      (e) => Buffer.byteLength(e.value) <= 1024 * 1024,
    ),
  ).toBe(true);
  expect(
    [...entries.values()].reduce(
      (sum, e) => sum + Buffer.byteLength(e.value),
      0,
    ),
  ).toBeGreaterThan(10 * 1024 * 1024);
  const reader = await remoteReader("large");
  const result = await reader.read("item", valid);
  expect(result).toMatchObject({
    value: value.value,
    date: value.date,
    nested: [{ a: "b" }, null, null],
  });
  expect((result as typeof value).amount.toString()).toBe(
    value.amount.toString(),
  );
});
it.each(["missing", "corrupt", "expired", "manifest", "payload"])(
  "rejects %s data without returning a partial snapshot",
  async (failure) => {
    const { redis, entries } = artifactRedis();
    mocks.redis.mockResolvedValue(redis);
    const cache = await returnArtifacts(failure);
    await cache.save("item", { value: "ok" }, Date.now() + 10_000);
    const [chunk, manifest] = [...entries.keys()];
    if (failure === "missing") entries.delete(chunk!);
    if (failure === "corrupt") entries.get(chunk!)!.value = "corrupt";
    if (failure === "expired") entries.get(chunk!)!.expires = Date.now();
    if (failure === "manifest") entries.get(manifest!)!.value = '{"version":0}';
    const reader = await remoteReader(failure);
    expect(
      await reader.read(
        "item",
        failure === "payload" ? (_v): _v is { value: string } => false : valid,
      ),
    ).toBeUndefined();
  },
);
it("keeps the prior manifest on interrupted writes and logs the underlying cache failure", async () => {
  const { redis, entries } = artifactRedis();
  mocks.redis.mockResolvedValue(redis);
  const cache = await remoteReader("interrupted");
  await cache.save("item", { value: "old" }, Date.now() + 10_000);
  redis.set
    .mockImplementationOnce(redis.set.getMockImplementation()!)
    .mockRejectedValueOnce(new Error("Redis write failed"));
  const updated = { value: "new".repeat(600_000) };
  await cache.save("item", updated, Date.now() + 10_000);
  expect(await cache.read("item", valid)).toEqual(updated);
  const reader = await remoteReader("interrupted");
  expect(await reader.read("item", valid)).toEqual({ value: "old" });
  expect(console.warn).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      operation: "write chunk",
      chunkCount: 2,
      error: expect.objectContaining({
        message: "Redis write failed",
        stack: expect.any(String),
      }),
    }),
  );
  expect(
    [...entries.keys()].filter((k) => !k.includes(":chunk:")),
  ).toHaveLength(1);
});
it("isolates chunks from concurrent writers of the same logical artifact", async () => {
  const { redis, entries } = artifactRedis();
  mocks.redis.mockResolvedValue(redis);
  const a = await remoteReader("concurrent");
  const b = await remoteReader("concurrent");
  await Promise.all([
    a.save("item", { value: "a".repeat(1_500_000) }, Date.now() + 10_000),
    b.save("item", { value: "b".repeat(1_500_000) }, Date.now() + 20_000),
  ]);
  const reader = await remoteReader("concurrent");
  const result = await reader.read("item", valid);
  expect(["a".repeat(1_500_000), "b".repeat(1_500_000)]).toContain(
    result?.value,
  );
  const generations = new Set(
    [...entries.keys()]
      .filter((k) => k.includes(":chunk:"))
      .map((k) => k.split(":").at(-2)),
  );
  expect(generations.size).toBe(2);
});
it("falls back to complete local artifacts, evicts whole artifacts, and skips unretainable ones", async () => {
  mocks.redis.mockResolvedValue(null);
  const cache = await remoteReader("local-budget");
  await cache.save("small", { value: "keep" }, Date.now() + 10_000);
  await cache.save(
    "oversized",
    { value: "x".repeat(65 * 1024 * 1024) },
    Date.now() + 10_000,
  );
  expect(await cache.read("oversized", valid)).toBeUndefined();
  expect(await cache.read("small", valid)).toEqual({ value: "keep" });
  const medium = { value: "x".repeat(34 * 1024 * 1024) };
  await cache.save("first", medium, Date.now() + 10_000);
  await cache.save("second", medium, Date.now() + 10_000);
  expect(await cache.read("first", valid)).toBeUndefined();
  expect(await cache.read("second", valid)).toBe(medium);
});
it("propagates resource errors rather than disguising them as cache misses", async () => {
  const { redis } = artifactRedis();
  mocks.redis.mockResolvedValue(redis);
  const failure = new ResourceLimitError("Deadline", 503, 5, "read_deadline");
  // Import the same resource-error instance as the reset storage module.
  vi.resetModules();
  const { ResourceLimitError: CurrentError } =
    await import("../../resource-error");
  const error = new CurrentError(
    failure.message,
    failure.status,
    failure.retryAfter,
    failure.code,
  );
  redis.get.mockRejectedValue(error);
  const cache = await (
    await import("./return-artifacts.server")
  ).returnArtifacts("resource");
  await expect(cache.read("item", valid)).rejects.toBe(error);
});

it("reassembles remote artifacts larger than the entire local cache without retaining a partial value", async () => {
  const { redis } = artifactRedis();
  mocks.redis.mockResolvedValue(redis);
  const cache = await remoteReader("remote-oversized");
  const value = { value: "x".repeat(65 * 1024 * 1024) };
  await cache.save("item", value, Date.now() + 10_000);
  const reader = await remoteReader("remote-oversized");
  expect(await reader.read("item", valid)).toEqual(value);
  redis.get.mockClear();
  expect(await reader.read("item", valid)).toEqual(value);
  expect(redis.get).toHaveBeenCalled();
});
