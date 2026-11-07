import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HistorySeries, HistoryTask, HistoryFailure } from "./types";
import { HistoryFeatureUnavailable, HistoryPending } from "./types";
const mocks = vi.hoisted(() => ({
  redis: vi.fn(),
  fetch: vi.fn(),
  capability: vi.fn(),
}));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("./provider", () => ({ fetchHistory: mocks.fetch }));
vi.mock("./capability", () => ({ historyCapability: mocks.capability }));
import { createHistoricalLoader } from "./loader";
import { clearHistorySeries, historyCoverageKey } from "./cache";
import { resolveHistoricalRate } from "./resolve";
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const request = (symbol: string, date = "2026-11-01") => ({
  unit: "SECURITY" as const,
  symbol,
  tradeCurrency: "USD",
  currency: null,
  cryptocurrency: null,
  date: new Date(`${date}T00:00:00Z`),
});
let suffix = 0;
let stored: Map<string, { timestamp: number; value: number }[]>;
let keys: Map<string, string>;
const redis = {
  ts: {
    range: vi.fn(async (key: string, from: number, to: number) =>
      (stored.get(key) ?? []).filter(
        (p) => p.timestamp >= from && p.timestamp <= to,
      ),
    ),
    revRange: vi.fn(async (key: string, _from: string, to: number) =>
      (stored.get(key) ?? []).filter((p) => p.timestamp <= to).slice(-1),
    ),
    add: vi.fn(async (key: string, timestamp: number, value: number) => {
      stored.set(key, [...(stored.get(key) ?? []), { timestamp, value }]);
    }),
  },
  get: vi.fn(async (key: string) => keys.get(key) ?? null),
  del: vi.fn(async (names: string[]) => {
    for (const name of names) {
      stored.delete(name);
      keys.delete(name);
    }
  }),
  zRangeByScore: vi.fn(async (key: string) =>
    JSON.parse(keys.get(key) ?? "[]").map((value: unknown) =>
      JSON.stringify(value),
    ),
  ),
  zAdd: vi.fn(async (key: string, entry: { value: string }) => {
    keys.set(
      key,
      JSON.stringify([
        ...JSON.parse(keys.get(key) ?? "[]"),
        JSON.parse(entry.value),
      ]),
    );
  }),
  zRemRangeByScore: vi.fn(),
  zRemRangeByRank: vi.fn(),
  expire: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  stored = new Map();
  keys = new Map();
  mocks.redis.mockResolvedValue(redis);
  mocks.capability.mockImplementation(async () => ({
    supported: true,
    set: vi.fn(),
  }));
  suffix++;
});
afterEach(() => vi.useRealTimers());
it("reads distinct raw series once for thousands of composite dates and shares USD/CHF", async () => {
  const dates = Array.from({ length: 1000 }, (_, i) =>
    new Date(time("2024-01-01") + i * 86400000).toISOString().slice(0, 10),
  );
  const requests = dates.flatMap((date) => [
    request(`A${suffix}`, date),
    request(`B${suffix}`, date),
  ]);
  for (const symbol of [`A${suffix}`, `B${suffix}`])
    stored.set(
      `valuation:marketstack:${symbol}:USD`,
      dates.map((date) => ({ timestamp: time(date), value: 100 })),
    );
  stored.set(
    "valuation:currencylayer:USD:CHF",
    dates.map((date) => ({ timestamp: time(date), value: 0.9 })),
  );
  const loader = await createHistoricalLoader(
    requests,
    "CHF",
    "2026-11-06",
    {},
  );
  for (const input of requests)
    expect((await loader.lookup(input)).rate?.toNumber()).toBe(90);
  expect(redis.ts.range).toHaveBeenCalledTimes(3);
  expect(redis.ts.revRange).toHaveBeenCalledTimes(3);
  expect(redis.zRangeByScore).toHaveBeenCalledTimes(3);
  expect(redis.get).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("reuses verified weekend gaps, obeys publication boundaries and expires proofs without extending reads", async () => {
  const input = request(`GAP${suffix}`);
  const key = `valuation:marketstack:${input.symbol}:USD`;
  stored.set(key, [{ timestamp: time("2026-10-30"), value: 123 }]);
  const coverage = {
    from: time("2026-10-31"),
    to: time("2026-11-01"),
    publication: time("2026-11-06"),
    expiresAt: Date.now() + 3600_000,
  };
  keys.set(historyCoverageKey(key), JSON.stringify([coverage]));
  for (let i = 0; i < 2; i++) {
    const loader = await createHistoricalLoader(
      [input],
      "USD",
      "2026-11-06",
      {},
    );
    expect((await loader.lookup(input)).rate?.toNumber()).toBe(123);
    expect(loader.pending()).toBe(0);
  }
  expect(mocks.fetch).not.toHaveBeenCalled();
  const changed = await createHistoricalLoader(
    [input],
    "USD",
    "2026-11-07",
    {},
  );
  await expect(changed.lookup(input)).rejects.toBeInstanceOf(HistoryPending);
  vi.setSystemTime(coverage.expiresAt + 1);
  const expired = await createHistoricalLoader(
    [input],
    "USD",
    "2026-11-06",
    {},
  );
  await expect(expired.lookup(input)).rejects.toBeInstanceOf(HistoryPending);
});
it("falls back only for unsupported range features and groups symbols per date while backtracking confirmed gaps", async () => {
  const capability = {
    supported: undefined as boolean | undefined,
    set: vi.fn(),
  };
  mocks.capability.mockResolvedValue(capability);
  mocks.fetch.mockImplementation(async (task: HistoryTask) => {
    if (task.mode === "range") throw new HistoryFeatureUnavailable();
    return {
      complete: true,
      points: Object.fromEntries(
        task.series.map((s) => [
          s.key,
          task.from === "2026-10-30" ? [{ date: task.from, value: 15 }] : [],
        ]),
      ),
    };
  });
  const inputs = [request(`FIRST${suffix}`), request(`SECOND${suffix}`)];
  const loader = await createHistoricalLoader(inputs, "USD", "2026-11-06", {});
  for (let i = 0; i < 4; i++) await loader.pump();
  expect(
    mocks.fetch.mock.calls.map(([t]) => [t.mode, t.from, t.series.length]),
  ).toEqual([
    ["range", "2026-10-02", 2],
    ["day", "2026-11-01", 2],
    ["day", "2026-10-31", 2],
    ["day", "2026-10-30", 2],
  ]);
  expect((await loader.lookup(inputs[0]!)).rate?.toNumber()).toBe(15);
  const again = await createHistoricalLoader(inputs, "USD", "2026-11-06", {});
  expect(again.pending()).toBe(0);
  expect(mocks.fetch).toHaveBeenCalledTimes(4);
});
it("does not establish coverage on transient failures and bounds retries", async () => {
  mocks.fetch.mockRejectedValue(new Error("quota"));
  const failures: Record<string, HistoryFailure> = {};
  const loader = await createHistoricalLoader(
    [request(`FAIL${suffix}`)],
    "USD",
    "2026-11-06",
    failures,
  );
  for (let i = 0; i < 2; i++) {
    await loader.pump();
    vi.setSystemTime(Date.now() + 1001);
  }
  await expect(loader.pump()).rejects.toThrow("quota");
  expect(redis.zAdd).not.toHaveBeenCalled();
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
});
it("uses bounded local data during Redis outage, then expires it and clears prices together with proofs", async () => {
  mocks.redis.mockResolvedValue(null);
  mocks.fetch.mockImplementation(async (t: HistoryTask) => ({
    complete: true,
    points: Object.fromEntries(
      t.series.map((s) => [s.key, [{ date: t.to, value: 42 }]]),
    ),
  }));
  const input = request(`LOCAL${suffix}`);
  const loader = await createHistoricalLoader([input], "USD", "2026-11-06", {});
  await loader.pump();
  expect((await loader.lookup(input)).rate?.toNumber()).toBe(42);
  const warm = await createHistoricalLoader([input], "USD", "2026-11-06", {});
  expect(warm.pending()).toBe(0);
  vi.setSystemTime(Date.now() + 901_000);
  const expired = await createHistoricalLoader(
    [input],
    "USD",
    "2026-11-06",
    {},
  );
  await expect(expired.lookup(input)).rejects.toBeInstanceOf(HistoryPending);
  mocks.redis.mockResolvedValue(redis);
  const series: HistorySeries = {
    provider: "MARKETSTACK",
    code: input.symbol,
    currency: "USD",
    key: `valuation:marketstack:${input.symbol}:USD`,
  };
  await clearHistorySeries(series);
  expect(redis.del).toHaveBeenCalledWith([
    series.key,
    historyCoverageKey(series.key),
  ]);
});
it("requires proof for every backtracked day and preserves the older-cache fallback after 30 days", () => {
  const date = time("2026-11-01"),
    publication = time("2026-11-06");
  const point = { timestamp: time("2026-09-01"), value: 7 };
  expect(
    resolveHistoricalRate({ points: [point], coverage: [] }, date, publication),
  ).toBeUndefined();
  const proof = {
    from: date - 30 * 86400000,
    to: date,
    publication,
    expiresAt: Date.now() + 10000,
  };
  expect(
    resolveHistoricalRate(
      { points: [point], coverage: [proof] },
      date,
      publication,
    )?.rate?.toNumber(),
  ).toBe(7);
  expect(
    resolveHistoricalRate({ points: [], coverage: [proof] }, date, publication)
      ?.rate,
  ).toBeNull();
});
it("keeps valid sparse-range prices, checks nullable closes individually and only caches temporary backtracking", async () => {
  const input = request(`SPARSE${suffix}`);
  const key = `valuation:marketstack:${input.symbol}:USD`;
  const failures: Record<string, HistoryFailure> = {};
  mocks.fetch.mockImplementation(async (task: HistoryTask) => ({
    complete: true,
    points: {
      [key]: task.mode === "range" ? [{ date: "2026-10-30", value: 15 }] : [],
    },
    unavailable: { [key]: ["2026-11-01"] },
  }));
  const loader = await createHistoricalLoader(
    [input],
    "USD",
    "2026-11-06",
    failures,
  );
  await loader.pump();
  await expect(loader.lookup(input)).rejects.toBeInstanceOf(HistoryPending);
  expect(
    redis.zAdd.mock.calls.map(([, v]) => JSON.parse(v.value)),
  ).not.toContainEqual(
    expect.objectContaining({
      from: time("2026-11-01"),
      to: time("2026-11-01"),
    }),
  );
  await loader.pump();
  expect(mocks.fetch.mock.calls[1]![0].mode).toBe("day");
  const carried = await loader.lookup(input);
  expect(carried.rate?.toNumber()).toBe(15);
  expect(carried.source).toBe("fallback");
  expect(carried.validUntil).toBeLessThanOrEqual(Date.now() + 3600_000);
  expect(
    redis.zAdd.mock.calls.map(([, v]) => JSON.parse(v.value)),
  ).toContainEqual(
    expect.objectContaining({
      temporary: true,
      from: time("2026-11-01"),
      to: time("2026-11-01"),
    }),
  );
  vi.setSystemTime(Date.now() + 3600_001);
  const expired = await createHistoricalLoader(
    [input],
    "USD",
    "2026-11-06",
    failures,
  );
  await expect(expired.lookup(input)).rejects.toBeInstanceOf(HistoryPending);
});
