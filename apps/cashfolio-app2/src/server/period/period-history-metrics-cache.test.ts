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
const loadPeriodHistoryPointMetricsWithCacheability = vi.hoisted(() => vi.fn());

vi.mock("../../redis.server", () => ({
  getRedisClient,
}));

vi.mock("./period-history-point-metrics.server", () => ({
  loadPeriodHistoryPointMetricsWithCacheability,
}));

import { getOrLoadPeriodHistoryPointMetrics } from "./period-history-metrics-cache";

function createMetrics(overrides = {}) {
  return {
    totalReturn: 10,
    savings: 8,
    cashFlow: 6,
    income: 12,
    expenses: 4,
    gainsLosses: 2,
    assets: 100,
    liabilities: 30,
    netWorth: 70,
    scopeOptions: {
      cashFlow: [],
      income: [],
      expenses: [],
      gainsLosses: [],
      assets: [],
      liabilities: [],
    },
    ...overrides,
  };
}

describe("period history metrics cache", () => {
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
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
      metrics: createMetrics(),
      cacheableFromPermanentValuationCache: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PERIOD_BASE_CACHE_ENV;
  });

  it("stores and reuses env-scoped generated history metrics entries", async () => {
    const first = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
      metricScopeFilter: {
        metric: "income",
        scope: "account:income-a",
      },
    });
    const second = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
      metricScopeFilter: {
        metric: "income",
        scope: "account:income-a",
      },
    });

    expect(first).toEqual(createMetrics());
    expect(second).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).toBe(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:income:account:income-a",
    );
  });

  it("adds a UTC-day discriminator only for current explicit periods", async () => {
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(firstKey).toBe(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-05:2026-05-11:total",
    );

    vi.setSystemTime(new Date("2026-05-12T14:30:00.000Z"));
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [secondKey] = redisClient.setEx.mock.calls[1] ?? [];
    expect(secondKey).toBe(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-05:2026-05-12:total",
    );
  });

  it("ignores stale v1 history metrics entries", async () => {
    redisState.kv.set(
      "period:history:metrics:v1:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 0 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores stale v2 history metrics entries computed from old base data", async () => {
    redisState.kv.set(
      "period:history:metrics:v2:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 0 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores stale v3 history metrics entries computed before legacy cash fallback", async () => {
    redisState.kv.set(
      "period:history:metrics:v3:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 0 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores stale v4 history metrics entries computed with legacy cash fallback", async () => {
    redisState.kv.set(
      "period:history:metrics:v4:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 50 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores legacy entries missing balance scope options", async () => {
    redisState.kv.set(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify({
        totalReturn: 1,
        savings: 1,
        cashFlow: 1,
        income: 1,
        expenses: 1,
        gainsLosses: 1,
        assets: 1,
        liabilities: 1,
        netWorth: 1,
        scopeOptions: {
          cashFlow: [],
          income: [],
          expenses: [],
          gainsLosses: [],
        },
      }),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("ignores legacy entries missing cash flow", async () => {
    const legacyMetrics: Partial<ReturnType<typeof createMetrics>> = {
      ...createMetrics(),
    };
    delete legacyMetrics.cashFlow;
    redisState.kv.set(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(legacyMetrics),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("ignores malformed cached scope option arrays", async () => {
    redisState.kv.set(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(
        createMetrics({
          scopeOptions: {
            cashFlow: [],
            income: [{ value: "income-a", label: "Income A", kind: "account" }],
            expenses: [],
            gainsLosses: [
              { value: "unit-type:fx", label: "FX", kind: "gainLoss" },
            ],
            assets: [],
            liabilities: [],
          },
        }),
      ),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("does not write metrics that used non-permanent valuation sources", async () => {
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValueOnce({
      metrics: createMetrics({ totalReturn: 20 }),
      cacheableFromPermanentValuationCache: false,
    });

    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("uses the shared generation so invalidation changes the metrics key", async () => {
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];

    redisState.kv.set(
      "period:base:generation:v1:preview-app-123:book-1",
      "gen-2",
    );
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    const [secondKey] = redisClient.setEx.mock.calls[1] ?? [];

    expect(firstKey).toContain(":gen-1:");
    expect(secondKey).toContain(":gen-2:");
  });

  it("computes uncached when redis is unavailable", async () => {
    getRedisClient.mockResolvedValueOnce(null);

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(result).toEqual(createMetrics());
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });
});
