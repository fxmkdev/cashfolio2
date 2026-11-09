import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
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

  it("reclassifies warm historical scopes after a committed account revision", async () => {
    const args = {
      accountBookId: "book-1",
      period: "2026-04",
      metricScopeFilter: {
        metric: "gainsLosses" as const,
        scope: "asset-class:EQUITIES" as const,
      },
    };
    const options = (assetClassId: string) => ({
      ...createMetrics().scopeOptions,
      gainsLosses: [
        {
          value: `asset-class:${assetClassId}`,
          label: assetClassId,
          kind: "gainLoss",
        },
        {
          value: "gain-loss-account:portfolio",
          label: `${assetClassId} / Portfolio`,
          kind: "gainLoss",
          parentValue: `asset-class:${assetClassId}`,
          accountId: "portfolio",
          legacyValues: ["explicit-account:portfolio"],
        },
      ],
    });
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
      metrics: createMetrics({
        scopeOptions: options("EQUITIES"),
        scopedMetricValue: toMoney(2),
      }),
      cacheableFromPermanentValuationCache: true,
    });
    const first = await getOrLoadPeriodHistoryPointMetrics(args);
    const warm = await getOrLoadPeriodHistoryPointMetrics(args);
    expect(toNumericMoney(warm)).toEqual(toNumericMoney(first));
    expect(warm.scopeOptions.gainsLosses[1]).toMatchObject({
      accountId: "portfolio",
      legacyValues: ["explicit-account:portfolio"],
    });
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "reclassified",
    });
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
      metrics: createMetrics({
        scopeOptions: options("OTHER_ASSETS"),
        scopedMetricValue: toMoney(0),
      }),
      cacheableFromPermanentValuationCache: true,
    });
    const changed = await getOrLoadPeriodHistoryPointMetrics(args);
    expect(changed.gainsLosses.toString()).toBe(first.gainsLosses.toString());
    expect(changed.scopedMetricValue?.toString()).toBe("0");
    expect(changed.scopeOptions.gainsLosses[1].parentValue).toBe(
      "asset-class:OTHER_ASSETS",
    );
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      2,
    );
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
});
