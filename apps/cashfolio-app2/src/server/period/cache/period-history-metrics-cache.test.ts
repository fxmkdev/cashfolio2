import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
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
const prisma = vi.hoisted(() => ({
  accountBook: { findUniqueOrThrow: vi.fn() },
}));

vi.mock("../../../prisma.server", () => ({ prisma }));

const loadPeriodHistoryPointMetricsWithCacheability = vi.hoisted(() => vi.fn());

vi.mock("../../../redis.server", () => ({
  getRedisClient,
}));

vi.mock("../history/period-history-point-metrics.server", () => ({
  loadPeriodHistoryPointMetricsWithCacheability,
}));

import { getOrLoadPeriodHistoryPointMetrics } from "./period-history-metrics-cache";

function createMetrics(overrides = {}) {
  return {
    totalReturn: toMoney(10),
    savings: toMoney(8),
    cashFlow: toMoney(6),
    income: toMoney(12),
    expenses: toMoney(4),
    gainsLosses: toMoney(2),
    assets: toMoney(100),
    liabilities: toMoney(30),
    netWorth: toMoney(70),
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
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T14:30:00.000Z"));
    process.env.PERIOD_BASE_CACHE_ENV = "preview-app-123";
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "gen-1",
    });
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

    expect(toNumericMoney(first)).toEqual(toNumericMoney(createMetrics()));
    expect(toNumericMoney(second)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).toBe(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:income:account:income-a",
    );
  });

  it("adds a UTC-day discriminator only for current explicit periods", async () => {
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(firstKey).toBe(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-05:2026-05-11:total",
    );

    vi.setSystemTime(new Date("2026-05-12T14:30:00.000Z"));
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [secondKey] = redisClient.setEx.mock.calls[1] ?? [];
    expect(secondKey).toBe(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-05:2026-05-12:total",
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

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
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

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
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

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
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

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores legacy entries missing balance scope options", async () => {
    redisState.kv.set(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify({
        totalReturn: toMoney(1),
        savings: toMoney(1),
        cashFlow: toMoney(1),
        income: toMoney(1),
        expenses: toMoney(1),
        gainsLosses: toMoney(1),
        assets: toMoney(1),
        liabilities: toMoney(1),
        netWorth: toMoney(1),
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

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
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
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(legacyMetrics),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("ignores malformed cached scope option arrays", async () => {
    redisState.kv.set(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
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

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
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

  it("returns calculated metrics without caching when a mutation commits during calculation", async () => {
    loadPeriodHistoryPointMetricsWithCacheability.mockImplementationOnce(
      async () => {
        prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
          periodCacheRevision: "gen-2",
        });
        return {
          metrics: createMetrics(),
          cacheableFromPermanentValuationCache: true,
        };
      },
    );
    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    expect(result.income.toString()).toBe("12");
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(2);
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("skips persistence when the final revision check fails", async () => {
    prisma.accountBook.findUniqueOrThrow
      .mockResolvedValueOnce({ periodCacheRevision: "gen-1" })
      .mockRejectedValueOnce(new Error("revision unavailable"));
    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    expect(result.income.toString()).toBe("12");
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("uses the shared generation so invalidation changes the metrics key", async () => {
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "gen-2",
    });
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

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("round-trips exact metric values on cold and warm cache reads", async () => {
    const exact = "12345678901234567890.123456789123456789";
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
      metrics: createMetrics({ assets: toMoney(exact) }),
      cacheableFromPermanentValuationCache: true,
    });
    const input = { accountBookId: "book-1", period: "2026-04" };
    const cold = await getOrLoadPeriodHistoryPointMetrics(input);
    const warm = await getOrLoadPeriodHistoryPointMetrics(input);
    expect(warm).toEqual(cold);
    expect(warm.assets.toString()).toBe(exact);
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("ignores numeric v5 metrics and treats invalid v6 decimal tags as misses", async () => {
    redisState.kv.set(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics()),
    );
    redisState.kv.set(
      "period:history:metrics:v6:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify({ totalReturn: { __cashfolioDecimal: "NaN" } }),
    );
    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    expect(result.totalReturn.toString()).toBe("10");
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
  });

  it("bypasses cached metrics when the database revision cannot be read", async () => {
    const args = { accountBookId: "book-1", period: "2026-04" };
    await getOrLoadPeriodHistoryPointMetrics(args);
    vi.clearAllMocks();
    prisma.accountBook.findUniqueOrThrow.mockRejectedValueOnce(
      new Error("DB unavailable"),
    );
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValueOnce({
      metrics: createMetrics({ income: toMoney("99.123456789123456789") }),
      cacheableFromPermanentValuationCache: true,
    });

    expect(
      (await getOrLoadPeriodHistoryPointMetrics(args)).income.toString(),
    ).toBe("99.123456789123456789");
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("does not join or reuse metrics from a pre-commit inflight load", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    loadPeriodHistoryPointMetricsWithCacheability.mockImplementationOnce(
      async () => {
        started();
        await gate;
        return {
          metrics: createMetrics({ income: toMoney("1.123456789123456789") }),
          cacheableFromPermanentValuationCache: true,
        };
      },
    );
    const args = { accountBookId: "book-1", period: "2026-04" };
    const oldLoad = getOrLoadPeriodHistoryPointMetrics(args);
    await ready;
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "gen-2",
    });
    try {
      expect(
        (await getOrLoadPeriodHistoryPointMetrics(args)).income.toString(),
      ).toBe("12");
    } finally {
      release();
      await oldLoad;
    }
    expect(
      (await getOrLoadPeriodHistoryPointMetrics(args)).income.toString(),
    ).toBe("12");
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      2,
    );
  });
});
