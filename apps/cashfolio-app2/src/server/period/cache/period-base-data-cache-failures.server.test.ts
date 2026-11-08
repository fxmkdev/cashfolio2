import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toNumericMoney } from "../../money-boundary";
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

  it("throws when redis is available but PERIOD_BASE_CACHE_ENV is missing", async () => {
    delete process.env.PERIOD_BASE_CACHE_ENV;

    await expect(
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
      }),
    ).rejects.toThrow(/PERIOD_BASE_CACHE_ENV/);
  });

  it("fails open when redis read fails", async () => {
    redisClient.get.mockRejectedValueOnce(new Error("redis read failed"));

    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result.periodValue)).toBe("2026-02");
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
  });

  it("skips cache write for oversized payloads", async () => {
    prisma.account.findMany.mockImplementation(
      async (args: { where?: unknown }) => {
        const where = args.where as { type?: unknown } | undefined;
        if (
          where &&
          typeof where.type === "object" &&
          where.type != null &&
          "in" in where.type
        ) {
          return [
            {
              id: "asset-1",
              name: "x".repeat(2_300_000),
              groupId: null,
              type: AccountType.BALANCE,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
            },
          ];
        }
        return [];
      },
    );

    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it.each(["sMembers", "del", "set"] as const)(
    "does not reuse old data after cleanup %s fails",
    async (command) => {
      const args = { accountBookId: "book-1", period: "2026-02" };
      await periodBaseCache.getOrLoadPeriodBaseData(args);
      const oldKey = redisClient.setEx.mock.calls[0][0];
      prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
        periodCacheRevision: "committed-revision",
        classificationSchemes: [],
        referenceCurrency: "EUR",
        startDate: new Date("2026-01-01T00:00:00Z"),
      });
      const exactBalance = "9007199254740993.123456789123456789";
      prisma.booking.groupBy.mockResolvedValue([
        {
          accountId: "asset-1",
          _sum: { value: { toString: () => exactBalance } },
        },
      ]);
      redisClient[command].mockRejectedValueOnce(
        new Error("Redis unavailable"),
      );

      await expect(
        periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1"),
      ).resolves.toBeUndefined();
      const result = await periodBaseCache.getOrLoadPeriodBaseData(args);

      expect(result.referenceCurrency).toBe("EUR");
      expect(redisState.kv.has(oldKey)).toBe(true);
      expect(redisClient.setEx.mock.calls[1][0]).toContain(
        ":committed-revision:",
      );
      const warm = await periodBaseCache.getOrLoadPeriodBaseData(args);
      expect(result.endOfPeriodRawBalances[0]!.rawBalance.toString()).toBe(
        exactBalance,
      );
      expect(warm.endOfPeriodRawBalances[0]!.rawBalance.toString()).toBe(
        exactBalance,
      );
    },
  );

  it("loads fresh data when Redis is unavailable", async () => {
    getRedisClient.mockResolvedValue(null);
    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    await periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1");
    expect(result.periodValue).toBe("2026-02");
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("does not fail an already committed mutation when the cleanup namespace is missing", async () => {
    delete process.env.PERIOD_BASE_CACHE_ENV;
    await expect(
      periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1"),
    ).resolves.toBeUndefined();
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});
