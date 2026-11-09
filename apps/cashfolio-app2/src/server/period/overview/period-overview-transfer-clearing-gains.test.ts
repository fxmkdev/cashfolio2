import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Unit } from "../../../.prisma-client/enums";
import { moneyMultiply, type Money } from "../../../shared/money";
import {
  cleanupOverview,
  convertBookingValueToReference,
  getPeriodOverview,
  getUnitToReferenceExchangeRate,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
} from "./period-overview.test-support";
describe("getPeriodOverview", () => {
  beforeEach(resetOverview);
  afterEach(cleanupOverview);

  it("includes non-reference transfer-clearing positions in realized and unrealized gains/losses", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([
          {
            id: "c-open-usd",
            date: new Date("2025-12-20T00:00:00.000Z"),
            value: 10,
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            id: "c-sell-usd",
            date: new Date("2026-01-10T00:00:00.000Z"),
            value: -4,
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            id: "c-buy-usd",
            date: new Date("2026-01-15T00:00:00.000Z"),
            value: 3,
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    convertBookingValueToReference.mockImplementation(
      async ({
        value,
        currency,
        date,
      }: {
        value: Money;
        currency: string | null;
        date: Date;
      }) => {
        if (currency !== "USD") {
          return value;
        }
        const dateKey = date.toISOString().slice(0, 10);
        if (dateKey === "2026-01-10") {
          return moneyMultiply(value, 2);
        }
        if (dateKey === "2026-01-15") {
          return moneyMultiply(value, 3);
        }
        if (dateKey === "2026-01-31") {
          return moneyMultiply(value, 4);
        }
        return value;
      },
    );
    getUnitToReferenceExchangeRate.mockImplementation(
      async ({ date }: { date: Date }) => {
        const dateKey = date.toISOString().slice(0, 10);
        if (dateKey === "2025-12-31") {
          return 1;
        }
        if (dateKey === "2026-01-31") {
          return 4;
        }
        return 1;
      },
    );

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-clearing-gain-loss",
        period: "2026-01",
      },
    });

    expect(result.convertedBookingsCount).toBe(2);
    expect(result.skippedBookingsCount).toBe(0);
    expect(result.stats.realizedGainLoss).toBe(-4);
    expect(result.stats.unrealizedGainLoss).toBe(-21);
    expect(result.stats.gainsLosses).toBe(-25);
    expect(result.stats.totalReturn).toBe(-25);
    expect(result.stats.endOfPeriodLiabilities).toBe(36);
    expect(
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
        .hierarchy,
    ).toMatchObject([
      {
        id: "asset-class:unclassified",
        label: "Unclassified",
        children: [
          {
            label: "USD",
            children: [
              {
                label: "USD",
                realizedGainLoss: -4,
                unrealizedGainLoss: -21,
                totalGainLoss: -25,
              },
            ],
          },
        ],
        realizedGainLoss: -4,
        unrealizedGainLoss: -21,
        totalGainLoss: -25,
      },
    ]);
    expect(
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown.hierarchy.reduce(
        (sum, node) => sum + node.totalGainLoss,
        0,
      ),
    ).toBe(result.stats.gainsLosses);
  });

  it("tracks skipped counts when transfer-clearing conversions or rates are unavailable", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([
          {
            id: "c-usd-opening",
            date: new Date("2025-12-25T00:00:00.000Z"),
            value: 5,
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            id: "c-btc-in-period",
            date: new Date("2026-01-10T00:00:00.000Z"),
            value: 2,
            unit: Unit.CRYPTOCURRENCY,
            currency: null,
            cryptocurrency: "BTC",
            symbol: null,
            tradeCurrency: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    convertBookingValueToReference.mockImplementation(
      async ({ value, unit }: { value: Money; unit: Unit }) => {
        if (unit === Unit.CRYPTOCURRENCY) {
          return null;
        }
        return moneyMultiply(value, 2);
      },
    );
    getUnitToReferenceExchangeRate.mockImplementation(
      async ({ currency, date }: { currency: string | null; date: Date }) => {
        if (
          currency === "USD" &&
          date.toISOString().slice(0, 10) === "2025-12-31"
        ) {
          return null;
        }
        return 2;
      },
    );

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-clearing-missing-rates",
        period: "2026-01",
      },
    });

    expect(result.stats.endOfPeriodLiabilities).toBe(10);
    expect(result.stats.gainsLosses).toBe(0);
    expect(result.convertedBookingsCount).toBe(0);
    expect(result.skippedBookingsCount).toBe(3);
  });

  it("skips near-zero in-period transfer-clearing quantities before conversion", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([
          {
            id: "c-zero-in-period",
            date: new Date("2026-01-10T00:00:00.000Z"),
            value: 0,
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-clearing-near-zero",
        period: "2026-01",
      },
    });

    expect(result.convertedBookingsCount).toBe(0);
    expect(result.skippedBookingsCount).toBe(0);
    expect(convertBookingValueToReference).not.toHaveBeenCalled();
  });
});
