import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import {
  cleanupOverview,
  convertBookingValueToReference,
  getPeriodOverview,
  getUnitToReferenceExchangeRate,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
  transactionFilterIncludes,
} from "./period-overview.test-support";
describe("getPeriodOverview", () => {
  beforeEach(resetOverview);
  afterEach(cleanupOverview);

  it("computes FIFO realized/unrealized gains for holding transactions", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-holding",
        name: "AAPL",
        groupId: null,
        type: AccountType.BALANCE,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
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
          id: "booking-explicit-gain-loss",
          transactionId: "tx-explicit",
          date: new Date("2026-01-18T00:00:00.000Z"),
          value: -5,
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
    prisma.booking.groupBy
      .mockResolvedValueOnce([
        { accountId: "asset-holding", _sum: { value: 3 } },
      ])
      .mockResolvedValueOnce([
        { accountId: "asset-holding", _sum: { value: 0 } },
      ]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        {
          id: "tx-buy",
          bookings: [
            {
              id: "b-hold-buy",
              accountId: "asset-holding",
              date: new Date("2026-01-10T00:00:00.000Z"),
              value: 5,
              unit: Unit.SECURITY,
              currency: null,
              cryptocurrency: null,
              symbol: "AAPL",
              tradeCurrency: "USD",
              account: {
                type: AccountType.BALANCE,
                equityAccountSubtype: null,
              },
            },
            {
              id: "b-cash-buy",
              accountId: "asset-cash",
              date: new Date("2026-01-10T00:00:00.000Z"),
              value: -700,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                type: AccountType.BALANCE,
                equityAccountSubtype: null,
              },
            },
          ],
        },
        {
          id: "tx-sell",
          bookings: [
            {
              id: "b-hold-sell",
              accountId: "asset-holding",
              date: new Date("2026-01-20T00:00:00.000Z"),
              value: -2,
              unit: Unit.SECURITY,
              currency: null,
              cryptocurrency: null,
              symbol: "AAPL",
              tradeCurrency: "USD",
              account: {
                type: AccountType.BALANCE,
                equityAccountSubtype: null,
              },
            },
            {
              id: "b-cash-sell",
              accountId: "asset-cash",
              date: new Date("2026-01-20T00:00:00.000Z"),
              value: 300,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                type: AccountType.BALANCE,
                equityAccountSubtype: null,
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    convertBookingValueToReference.mockImplementation(async ({ value }) => {
      if (toMoney(value).equals(5)) return 700;
      if (toMoney(value).equals(-700)) return -700;
      if (toMoney(value).equals(-2)) return -260;
      if (toMoney(value).equals(300)) return 300;
      if (toMoney(value).equals(3)) return 390;
      return value;
    });
    getUnitToReferenceExchangeRate.mockResolvedValue(130);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-1",
        period: "2026-01",
      },
    });

    expect(result.convertedBookingsCount).toBe(5);
    expect(result.skippedBookingsCount).toBe(0);
    expect(result.stats).toMatchObject({
      income: 0,
      expenses: 0,
      savings: 0,
      explicitGainLoss: 5,
      realizedGainLoss: 20,
      unrealizedGainLoss: -30,
      gainsLosses: -5,
      totalReturn: -5,
      endOfPeriodAssets: 390,
    });
    const gainsLossesBreakdownTotal =
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown.hierarchy.reduce(
        (sum, unitTypeNode) => sum + unitTypeNode.totalGainLoss,
        0,
      );
    expect(gainsLossesBreakdownTotal).toBe(result.stats.gainsLosses);
    expect(
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
        .hierarchy,
    ).toMatchObject([
      {
        id: "asset-class:unclassified",
        label: "Unclassified",
        children: [
          {
            label: "AAPL",
            children: [
              {
                label: "AAPL",
                totalGainLoss: -10,
              },
            ],
          },
          {
            label: "Unknown Unit",
            children: [
              {
                label: "Cash",
                totalGainLoss: 5,
              },
            ],
          },
        ],
        totalGainLoss: -5,
      },
    ]);
    expect(getUnitToReferenceExchangeRate).toHaveBeenCalled();
  });
});
