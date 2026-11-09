import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupOverview,
  DEFAULT_PERIOD_VALUE,
  ensureAuthorizedForAccountBookId,
  getPeriodOverview,
  prisma,
  resetOverview,
} from "./period-overview.test-support";
describe("getPeriodOverview", () => {
  beforeEach(resetOverview);
  afterEach(cleanupOverview);

  it("uses accountBook.startDate as the first selectable period floor", async () => {
    vi.setSystemTime(new Date("2026-01-08T12:00:00.000Z"));
    prisma.booking.groupBy.mockResolvedValueOnce([
      { accountId: "asset-chf", _sum: { value: 100 } },
    ]);

    const result = await getPeriodOverview({
      data: { accountBookId: "book-1", period: "mtd" },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(result.minBookingDate).toBe("2026-01-08T00:00:00.000Z");
    expect(result.stats.totalReturn).toBe(0);
    expect(result.stats.savings).toBe(0);
    expect(result.stats.income).toBe(0);
    expect(result.stats.expenses).toBe(0);
    expect(result.stats.gainsLosses).toBe(0);
    expect(result.stats.explicitGainLoss).toBe(0);
    expect(result.stats.realizedGainLoss).toBe(0);
    expect(result.stats.unrealizedGainLoss).toBe(0);
    expect(result.stats.endOfPeriodAssets).toBe(100);
    expect(result.stats.endOfPeriodLiabilities).toBe(0);
    expect(result.stats.endOfPeriodNetWorth).toBe(100);
    expect(result.expenseBreakdown.items).toEqual([]);
    expect(result.incomeBreakdown.items).toEqual([]);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("returns a zeroed overview when no bookings are present", async () => {
    vi.setSystemTime(new Date("2026-05-10T10:00:00.000Z"));
    prisma.account.findMany.mockResolvedValue([]);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-empty",
        period: "2026-01",
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-empty");
    expect(result.selectedPeriodValue).toBe("2026-01");
    expect(result.stats).toMatchObject({
      totalReturn: 0,
      savings: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      endOfPeriodNetWorth: 0,
      endOfPeriodAssets: 0,
      endOfPeriodLiabilities: 0,
    });
    expect(result.bookingsCount).toBe(0);
    expect(result.convertedBookingsCount).toBe(0);
    expect(result.skippedBookingsCount).toBe(0);
    expect(result.expenseBreakdown.items).toEqual([]);
    expect(result.incomeBreakdown.items).toEqual([]);
    expect(
      result.accountBreakdownsByGrouping.accountStructure.assetBreakdown.items,
    ).toEqual([]);
    expect(
      result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
        .items,
    ).toEqual([]);
  });

  it("ignores unsupported period values in input and falls back to default", async () => {
    vi.setSystemTime(new Date("2026-05-10T10:00:00.000Z"));

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-default-period",
        period: "not-a-real-period",
      },
    });

    expect(result.selectedPeriodValue).toBe(DEFAULT_PERIOD_VALUE);
  });
});
