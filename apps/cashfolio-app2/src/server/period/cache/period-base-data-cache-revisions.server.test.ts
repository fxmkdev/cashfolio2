import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAssetClassIds } from "../../../shared/classification/asset-class";
import {
  cleanupBaseDataCache,
  getRedisClient,
  periodBaseCache,
  prisma,
  redisClient,
  redisState,
  resetBaseDataCache,
} from "./period-base-data-cache.server.test-support";

describe("period base-data cache", () => {
  beforeEach(resetBaseDataCache);
  afterEach(cleanupBaseDataCache);

  it("reloads reporting metadata after a committed revision and ignores v11 snapshots", async () => {
    const args = { accountBookId: "book-1", period: "2026-02" };
    redisState.kv.set("period:base:v11:preview-app-123:book-1:0:2026-02", "{}");
    const first = await periodBaseCache.getOrLoadPeriodBaseData(args);
    expect(first.baseAssetLiabilityAccounts[0].assetClassId).toBe(
      defaultAssetClassIds.EQUITIES,
    );
    const query = prisma.account.findMany.getMockImplementation()!;
    prisma.account.findMany.mockImplementation(async (input) =>
      (await query(input)).map((account: Record<string, unknown>) => ({
        ...account,
        classifications: [{ nodeId: defaultAssetClassIds.OTHER_ASSETS }],
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      })),
    );
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      periodCacheRevision: "classification-edit",
      startDate: new Date("2026-01-01"),
    });
    const reloaded = await periodBaseCache.getOrLoadPeriodBaseData(args);
    expect(reloaded.baseAssetLiabilityAccounts[0].assetClassId).toBe(
      defaultAssetClassIds.OTHER_ASSETS,
    );
    expect(reloaded.baseAssetLiabilityAccounts[0].trackingMethod).toBe(
      "TOTAL_PORTFOLIO_VALUE",
    );
    expect(redisClient.setEx.mock.calls[1][0]).toContain(
      ":classification-edit:",
    );
  });

  it("returns a newer coherent snapshot without storing it under the lookup revision", async () => {
    prisma.accountBook.findUniqueOrThrow
      .mockResolvedValueOnce({ periodCacheRevision: "before-commit" })
      .mockResolvedValue({
        classificationSchemes: [],
        referenceCurrency: "EUR",
        startDate: new Date("2026-01-01T00:00:00Z"),
        periodCacheRevision: "after-commit",
      });

    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(result.referenceCurrency).toBe("EUR");
    expect(redisClient.get).toHaveBeenCalledWith(
      expect.stringContaining(":before-commit:"),
    );
    expect(redisClient.setEx).not.toHaveBeenCalled();
    expect(redisClient.sAdd).not.toHaveBeenCalled();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("does not persist or fall back to global reads after a failed snapshot", async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error("snapshot failed"));
    await expect(
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
      }),
    ).rejects.toThrow("snapshot failed");
    expect(prisma.accountGroup.findMany).not.toHaveBeenCalled();
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("uses the committed revision when Redis was offline during the mutation", async () => {
    const args = { accountBookId: "book-1", period: "2026-02" };
    await periodBaseCache.getOrLoadPeriodBaseData(args);
    getRedisClient.mockRejectedValueOnce(new Error("Connection failed"));
    await expect(
      periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1"),
    ).resolves.toBeUndefined();
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "after-outage",
      classificationSchemes: [],
      referenceCurrency: "EUR",
      startDate: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await periodBaseCache.getOrLoadPeriodBaseData(args);
    expect(result.referenceCurrency).toBe("EUR");
    expect(redisClient.setEx.mock.calls[1][0]).toContain(":after-outage:");
  });

  it("bypasses cache reads and writes when the database revision cannot be read", async () => {
    const args = { accountBookId: "book-1", period: "2026-02" };
    await periodBaseCache.getOrLoadPeriodBaseData(args);
    vi.clearAllMocks();
    prisma.accountBook.findUniqueOrThrow.mockRejectedValueOnce(
      new Error("Revision read failed"),
    );

    const result = await periodBaseCache.getOrLoadPeriodBaseData(args);
    expect(result.periodValue).toBe("2026-02");
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });
});
