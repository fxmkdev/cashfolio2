import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAssetClassIds } from "../../../shared/classification/asset-class";
import { toNumericMoney } from "../../money-boundary";
import {
  cleanupBaseDataCache,
  periodBaseCache,
  prisma,
  redisClient,
  redisState,
  resetBaseDataCache,
} from "./period-base-data-cache.server.test-support";

describe("period base-data cache", () => {
  beforeEach(resetBaseDataCache);
  afterEach(cleanupBaseDataCache);

  it("loads on miss, stores with env-scoped key, and reuses cached hit", async () => {
    const first = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    const second = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).toContain(
      "period:base:v12:preview-app-123:book-1:0:2026-02",
    );

    expect(first.selection.from).toBeInstanceOf(Date);
    expect(first.baseAssetLiabilityAccounts[0].assetClassId).toBe(
      defaultAssetClassIds.EQUITIES,
    );
    expect(second.baseAssetLiabilityAccounts[0].assetClassId).toBe(
      defaultAssetClassIds.EQUITIES,
    );
    expect(second.selection.from).toBeInstanceOf(Date);
    expect(second.baseAssetLiabilityAccounts[0].trackingMethod).toBe(
      "INDIVIDUAL_UNITS",
    );
  });

  it("invalidates all cached period entries for one account book in one namespace", async () => {
    redisState.kv.set("period:base:v12:preview-app-123:book-1:0:2026-01", "{}");
    redisState.kv.set("period:base:v12:preview-app-123:book-1:0:2026-02", "{}");
    redisState.kv.set("period:base:v12:preview-app-123:book-2:0:2026-02", "{}");
    redisState.sets.set(
      "period:base:index:v12:preview-app-123:book-1:0",
      new Set([
        "period:base:v12:preview-app-123:book-1:0:2026-01",
        "period:base:v12:preview-app-123:book-1:0:2026-02",
      ]),
    );

    await periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1");

    expect(
      toNumericMoney(
        redisState.kv.has("period:base:v12:preview-app-123:book-1:0:2026-01"),
      ),
    ).toBe(false);
    expect(
      toNumericMoney(
        redisState.kv.has("period:base:v12:preview-app-123:book-1:0:2026-02"),
      ),
    ).toBe(false);
    expect(
      toNumericMoney(
        redisState.kv.has("period:base:v12:preview-app-123:book-2:0:2026-02"),
      ),
    ).toBe(true);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
    expect(toNumericMoney(redisClient.set.mock.calls[0]?.[0])).toBe(
      "period:base:generation:v1:preview-app-123:book-1",
    );
  });

  it("keys preset periods by resolved concrete date range", async () => {
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).toContain(
      "period:base:v12:preview-app-123:book-1:0:month:2026-05-01:2026-05-01",
    );
  });

  it("keys explicit current periods with a UTC-day discriminator", async () => {
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(firstKey).toContain(
      "period:base:v12:preview-app-123:book-1:0:2026-05:2026-05-01",
    );

    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [secondKey] = redisClient.setEx.mock.calls[1] ?? [];
    expect(secondKey).toContain(
      "period:base:v12:preview-app-123:book-1:0:2026-05:2026-05-02",
    );
  });

  it("only reads the database revision for month preset cache hits", async () => {
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenLastCalledWith({
      where: { id: "book-1" },
      select: { periodCacheRevision: true },
    });
  });

  it("switches generation after invalidation so old entries are not reused", async () => {
    redisState.kv.set(
      "period:base:v12:preview-app-123:book-1:0:month:2026-05-01:2026-05-01",
      JSON.stringify({ cached: true }),
    );
    redisState.sets.set(
      "period:base:index:v12:preview-app-123:book-1:0",
      new Set([
        "period:base:v12:preview-app-123:book-1:0:month:2026-05-01:2026-05-01",
      ]),
    );

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "gen-2",
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00Z"),
    });
    await periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1");

    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).not.toContain(":0:month:2026-05-01:2026-05-01");
  });
});
