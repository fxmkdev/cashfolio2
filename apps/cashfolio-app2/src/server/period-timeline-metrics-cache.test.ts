import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  kv: new Map<string, string>(),
}));

const redisClient = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => redisState.kv.get(key) ?? null),
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    redisState.kv.set(key, value);
  }),
}));

const getRedisClient = vi.hoisted(() =>
  vi.fn<() => Promise<typeof redisClient | null>>(async () => redisClient),
);
const loadPeriodTimelinePointMetricsWithCacheability = vi.hoisted(() =>
  vi.fn(),
);

vi.mock("../redis.server", () => ({
  getRedisClient,
}));

vi.mock("./period-timeline-point-metrics.server", () => ({
  loadPeriodTimelinePointMetricsWithCacheability,
}));

import { getOrLoadPeriodTimelinePointMetrics } from "./period-timeline-metrics-cache";

function createMetrics(overrides = {}) {
  return {
    totalReturn: 10,
    savings: 8,
    income: 12,
    expenses: 4,
    gainsLosses: 2,
    assets: 100,
    liabilities: 30,
    netWorth: 70,
    scopeOptions: {
      income: [],
      expenses: [],
    },
    ...overrides,
  };
}

describe("period timeline metrics cache", () => {
  beforeEach(() => {
    redisState.kv.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T14:30:00.000Z"));
    process.env.PERIOD_BASE_CACHE_ENV = "preview-app-123";
    redisState.kv.set(
      "period:base:generation:v1:preview-app-123:book-1",
      "gen-1",
    );
    loadPeriodTimelinePointMetricsWithCacheability.mockResolvedValue({
      metrics: createMetrics(),
      cacheableFromPermanentValuationCache: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PERIOD_BASE_CACHE_ENV;
  });

  it("stores and reuses env-scoped generated timeline metrics entries", async () => {
    const first = await getOrLoadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
      metricScopeFilter: {
        metric: "income",
        scope: "account:income-a",
      },
    });
    const second = await getOrLoadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
      metricScopeFilter: {
        metric: "income",
        scope: "account:income-a",
      },
    });

    expect(first).toEqual(createMetrics());
    expect(second).toEqual(createMetrics());
    expect(
      loadPeriodTimelinePointMetricsWithCacheability,
    ).toHaveBeenCalledTimes(1);
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).toBe(
      "period:timeline:metrics:v1:preview-app-123:book-1:gen-1:2026-05-11:2026-04:income:account:income-a",
    );
  });

  it("does not write metrics that used non-permanent valuation sources", async () => {
    loadPeriodTimelinePointMetricsWithCacheability.mockResolvedValueOnce({
      metrics: createMetrics({ totalReturn: 20 }),
      cacheableFromPermanentValuationCache: false,
    });

    await getOrLoadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("uses the shared generation so invalidation changes the metrics key", async () => {
    await getOrLoadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];

    redisState.kv.set(
      "period:base:generation:v1:preview-app-123:book-1",
      "gen-2",
    );
    await getOrLoadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    const [secondKey] = redisClient.setEx.mock.calls[1] ?? [];

    expect(firstKey).toContain(":gen-1:");
    expect(secondKey).toContain(":gen-2:");
  });

  it("computes uncached when redis is unavailable", async () => {
    getRedisClient.mockResolvedValueOnce(null);

    const result = await getOrLoadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });
});
