import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toNumericMoney } from "../../money-boundary";
import {
  cleanupHistoryMetricsCache,
  createMetrics,
  getOrLoadPeriodHistoryPointMetrics,
  loadPeriodHistoryPointMetricsWithCacheability,
  prisma,
  redisClient,
  resetHistoryMetricsCache,
} from "./period-history-metrics-cache.server.test-support";

describe("period history metrics cache", () => {
  beforeEach(resetHistoryMetricsCache);
  afterEach(cleanupHistoryMetricsCache);

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
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:income:account:income-a",
    );
  });

  it("adds a UTC-day discriminator only for current explicit periods", async () => {
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(firstKey).toBe(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-05:2026-05-11:total",
    );

    vi.setSystemTime(new Date("2026-05-12T14:30:00.000Z"));
    await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [secondKey] = redisClient.setEx.mock.calls[1] ?? [];
    expect(secondKey).toBe(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-05:2026-05-12:total",
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
});
