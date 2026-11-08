import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { moneyMultiply, type Money } from "../../../shared/money";
import {
  cleanupOverview,
  convertBookingValueToReference,
  findBreakdownNodeById,
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

  it("builds grouped virtual transfer clearing hierarchy for mixed units", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([
          {
            id: "c-chf",
            date: new Date("2026-01-05T00:00:00.000Z"),
            value: 100,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            id: "c-aapl",
            date: new Date("2026-01-06T00:00:00.000Z"),
            value: -5,
            unit: Unit.SECURITY,
            currency: null,
            cryptocurrency: null,
            symbol: "AAPL",
            tradeCurrency: "USD",
          },
          {
            id: "c-btc",
            date: new Date("2026-01-07T00:00:00.000Z"),
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
      async ({ value }) => value,
    );
    getUnitToReferenceExchangeRate.mockResolvedValue(1);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-mixed-clearing",
        period: "2026-01",
      },
    });

    expect(result.stats.endOfPeriodAssets).toBe(5);
    expect(result.stats.endOfPeriodLiabilities).toBe(102);
    expect(result.stats.endOfPeriodNetWorth).toBe(-97);

    const assetRoot = findBreakdownNodeById(
      result.accountBreakdownsByGrouping.accountStructure.assetBreakdown
        .hierarchy,
      "group:virtual:transfer-clearing",
    );
    const liabilityRoot = findBreakdownNodeById(
      result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
        .hierarchy,
      "group:virtual:transfer-clearing",
    );

    expect(assetRoot?.label).toBe("Transfer Clearing");
    expect(assetRoot?.children.map((child) => child.id)).toEqual(
      expect.arrayContaining(["group:virtual:transfer-clearing:security"]),
    );
    expect(
      findBreakdownNodeById(
        result.accountBreakdownsByGrouping.accountStructure.assetBreakdown
          .hierarchy,
        "account:virtual:transfer-clearing:account:security:AAPL:USD",
      )?.label,
    ).toBe("AAPL:USD");

    expect(liabilityRoot?.label).toBe("Transfer Clearing");
    expect(liabilityRoot?.children.map((child) => child.id)).toEqual(
      expect.arrayContaining([
        "group:virtual:transfer-clearing:currency",
        "group:virtual:transfer-clearing:cryptocurrency",
      ]),
    );
    expect(
      findBreakdownNodeById(
        result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
          .hierarchy,
        "account:virtual:transfer-clearing:account:currency:CHF",
      )?.label,
    ).toBe("CHF");
    expect(
      findBreakdownNodeById(
        result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
          .hierarchy,
        "account:virtual:transfer-clearing:account:crypto:BTC",
      )?.label,
    ).toBe("BTC");
  });

  it("routes positive and negative transfer-clearing unit balances into asset and liability totals", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([
          {
            id: "c-chf",
            date: new Date("2026-01-05T00:00:00.000Z"),
            value: 100,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            id: "c-usd",
            date: new Date("2026-01-06T00:00:00.000Z"),
            value: -40,
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
      }: {
        value: Money;
        currency: string | null;
      }) => {
        if (currency === "USD") {
          return moneyMultiply(value, 2);
        }
        return value;
      },
    );
    getUnitToReferenceExchangeRate.mockImplementation(
      async ({ currency }: { currency: string | null }) =>
        currency === "USD" ? 2 : 1,
    );

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-sign-routing",
        period: "2026-01",
      },
    });

    expect(result.stats.endOfPeriodAssets).toBe(80);
    expect(result.stats.endOfPeriodLiabilities).toBe(100);
    expect(result.stats.endOfPeriodNetWorth).toBe(-20);
    expect(
      result.accountBreakdownsByGrouping.accountStructure.assetBreakdown
        .totalAmount,
    ).toBe(80);
    expect(
      result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
        .totalAmount,
    ).toBe(100);
    expect(
      findBreakdownNodeById(
        result.accountBreakdownsByGrouping.accountStructure.assetBreakdown
          .hierarchy,
        "account:virtual:transfer-clearing:account:currency:USD",
      )?.amount,
    ).toBe(80);
    expect(
      findBreakdownNodeById(
        result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
          .hierarchy,
        "account:virtual:transfer-clearing:account:currency:CHF",
      )?.amount,
    ).toBe(100);
  });

  it("includes transfer-clearing balances even when qualifying bookings are outside the selected period window", async () => {
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
            date: new Date("2025-12-20T00:00:00.000Z"),
            value: 50,
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
      }: {
        value: Money;
        currency: string | null;
      }) => {
        if (currency === "USD") {
          return moneyMultiply(value, 2);
        }
        return value;
      },
    );
    getUnitToReferenceExchangeRate.mockResolvedValue(2);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-outside-period",
        period: "2026-01",
      },
    });

    expect(result.stats.endOfPeriodLiabilities).toBe(100);
    expect(
      result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
        .totalAmount,
    ).toBe(100);
    expect(result.convertedBookingsCount).toBe(0);
    expect(result.stats.gainsLosses).toBe(0);
  });

  it("keeps net worth neutral for posted legs by using opposite-sign transfer clearing", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-cash",
        name: "Cash",
        groupId: null,
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);
    prisma.booking.groupBy.mockResolvedValueOnce([
      { accountId: "asset-cash", _sum: { value: -100 } },
    ]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([
          {
            id: "c-cash-out",
            date: new Date("2026-01-15T00:00:00.000Z"),
            value: -100,
            unit: Unit.CURRENCY,
            currency: "CHF",
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
        accountBookId: "book-clearing-neutral-net-worth",
        period: "2026-01",
      },
    });

    expect(result.stats.endOfPeriodAssets).toBe(100);
    expect(result.stats.endOfPeriodLiabilities).toBe(100);
    expect(result.stats.endOfPeriodNetWorth).toBe(0);
    expect(
      result.accountBreakdownsByGrouping.accountStructure.assetBreakdown
        .totalAmount,
    ).toBe(100);
    expect(
      result.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
        .totalAmount,
    ).toBe(100);
    expect(
      findBreakdownNodeById(
        result.accountBreakdownsByGrouping.accountStructure.assetBreakdown
          .hierarchy,
        "account:virtual:transfer-clearing:account:currency:CHF",
      )?.amount,
    ).toBe(100);
  });
});
