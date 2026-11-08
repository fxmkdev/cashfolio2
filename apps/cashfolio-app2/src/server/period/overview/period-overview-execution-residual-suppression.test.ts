import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import { moneyMultiply, type Money } from "../../../shared/money";
import {
  cleanupOverview,
  convertBookingValueToReference,
  getPeriodOverview,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
  transactionFilterIncludes,
} from "./period-overview.test-support";

describe("getPeriodOverview", () => {
  beforeEach(resetOverview);

  afterEach(cleanupOverview);

  it("excludes synthetic execution residuals for transactions with explicit gain/loss bookings", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
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
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (transactionFilterIncludes(args.where?.transactionId, "tx-explicit")) {
        return Promise.resolve([
          {
            transactionId: "tx-explicit",
            accountId: "asset-cash",
            account: {
              name: "Cash",
            },
          },
        ]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "booking-expense-usd",
          transactionId: "tx-explicit",
          date: new Date("2026-01-15T00:00:00.000Z"),
          value: 100,
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          account: {
            id: "expense-foreign",
            name: "Travel USD",
            groupId: null,
            equityAccountSubtype: EquityAccountSubtype.EXPENSE,
          },
        },
        {
          id: "booking-explicit-loss",
          transactionId: "tx-explicit",
          date: new Date("2026-01-15T00:00:00.000Z"),
          value: 10,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          account: {
            id: "gainloss-1",
            name: "GainLoss",
            groupId: null,
            equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
          },
        },
      ]);
    });
    prisma.booking.groupBy.mockResolvedValueOnce([
      { accountId: "asset-cash", _sum: { value: -100 } },
    ]);
    prisma.transaction.findMany.mockReset();
    prisma.transaction.findMany.mockImplementation(() => Promise.resolve([]));
    convertBookingValueToReference.mockImplementation(
      async ({ value, currency }: { value: Money; currency: string | null }) =>
        currency === "USD" ? moneyMultiply(value, 0.9) : value,
    );

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-explicit-overlap",
        period: "2026-01",
      },
    });

    expect(result.convertedBookingsCount).toBe(2);
    expect(result.skippedBookingsCount).toBe(0);
    expect(result.stats).toMatchObject({
      income: 0,
      expenses: 90,
      savings: -90,
      explicitGainLoss: -10,
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      gainsLosses: -10,
      totalReturn: -100,
      endOfPeriodNetWorth: -100,
    });
  });

  it("skips synthetic execution residual realization when any booking conversion is missing", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
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
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "booking-expense-usd",
          transactionId: "tx-missing-rate",
          date: new Date("2026-01-15T00:00:00.000Z"),
          value: 100,
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          account: {
            id: "expense-foreign",
            name: "Travel USD",
            groupId: null,
            equityAccountSubtype: EquityAccountSubtype.EXPENSE,
          },
        },
      ]);
    });
    prisma.booking.groupBy.mockResolvedValueOnce([
      { accountId: "asset-cash", _sum: { value: -100 } },
    ]);
    prisma.transaction.findMany.mockReset();
    prisma.transaction.findMany.mockImplementation((args) => {
      if (args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "tx-missing-rate",
          bookings: [
            {
              id: "booking-cash-chf",
              accountId: "asset-cash",
              date: new Date("2026-01-15T00:00:00.000Z"),
              value: -100,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                name: "Cash",
                type: AccountType.BALANCE,
                equityAccountSubtype: null,
              },
            },
            {
              id: "booking-expense-usd",
              accountId: "expense-foreign",
              date: new Date("2026-01-15T00:00:00.000Z"),
              value: 100,
              unit: Unit.CURRENCY,
              currency: "USD",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                name: "Travel USD",
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.EXPENSE,
              },
            },
          ],
        },
      ]);
    });
    convertBookingValueToReference.mockImplementation(
      async ({ value, currency }: { value: Money; currency: string | null }) =>
        currency === "USD" ? null : value,
    );

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-missing-rate",
        period: "2026-01",
      },
    });

    expect(result.convertedBookingsCount).toBe(1);
    expect(result.skippedBookingsCount).toBe(2);
    expect(result.stats).toMatchObject({
      savings: 0,
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      gainsLosses: 0,
      totalReturn: 0,
      endOfPeriodNetWorth: -100,
    });
    expect(
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
        .hierarchy,
    ).toEqual([]);
  });
});
