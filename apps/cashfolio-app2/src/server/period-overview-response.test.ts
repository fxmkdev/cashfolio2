import { describe, expect, it } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import {
  accumulateConvertedEquityBooking,
  createPeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";
import { buildPeriodOverviewResponse } from "./period-overview-response";

function createSelection() {
  return {
    periodValue: "2026-01",
    periodSpecifier: "month" as const,
    granularity: "month" as const,
    year: 2026,
    month: 0,
    from: new Date("2026-01-01T00:00:00.000Z"),
    to: new Date("2026-01-31T00:00:00.000Z"),
    label: "Jan 2026",
  };
}

describe("period overview response", () => {
  it("keeps gains/losses zeroed before account-book start while preserving split metrics", () => {
    const equityAggregation = createPeriodOverviewEquityAggregation();
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "income-1",
          name: "Income",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      },
      convertedValue: -100,
      aggregation: equityAggregation,
    });
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "expense-1",
          name: "Expense",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        },
      },
      convertedValue: 40,
      aggregation: equityAggregation,
    });
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "gainloss-1",
          name: "Gain/Loss",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      },
      convertedValue: -20,
      aggregation: equityAggregation,
    });

    const response = buildPeriodOverviewResponse({
      selection: createSelection(),
      minPeriodDate: new Date("2026-01-01T00:00:00.000Z"),
      currentDay: new Date("2026-02-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
      groupById: new Map(),
      assetLiabilityAccounts: [],
      equityAggregation,
      transactionGainLoss: 12,
      holdingGainLoss: 8,
      isBeforeAccountBookStart: true,
      endOfPeriodBalanceStats: {
        assets: 0,
        liabilities: 0,
        netWorth: 0,
        convertedBalanceByAccountId: new Map(),
      },
      bookingsCount: 3,
      convertedBookingsCount: 3,
      skippedBookingsCount: 0,
    });

    expect(response.stats).toMatchObject({
      income: 100,
      expenses: 40,
      savings: 60,
      gainsLosses: 0,
      totalReturn: 60,
      explicitGainLoss: 20,
      transactionGainLoss: 12,
      holdingGainLoss: 8,
    });
    expect(response.currentMonthValue).toBe("2026-02");
    expect(response.availableYears).toEqual([2026]);
  });

  it("assembles breakdowns and end-of-period stats from converted balances", () => {
    const equityAggregation = createPeriodOverviewEquityAggregation();
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "income-1",
          name: "Income",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      },
      convertedValue: -120,
      aggregation: equityAggregation,
    });
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "expense-1",
          name: "Expense",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        },
      },
      convertedValue: 20,
      aggregation: equityAggregation,
    });
    accumulateConvertedEquityBooking({
      booking: {
        account: {
          id: "gainloss-1",
          name: "Gain/Loss",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      },
      convertedValue: -10,
      aggregation: equityAggregation,
    });

    const response = buildPeriodOverviewResponse({
      selection: createSelection(),
      minPeriodDate: new Date("2025-01-01T00:00:00.000Z"),
      currentDay: new Date("2026-02-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
      groupById: new Map(),
      assetLiabilityAccounts: [
        {
          id: "asset-1",
          name: "Cash",
          groupId: null,
          type: AccountType.ASSET,
        },
        {
          id: "liability-1",
          name: "Credit Card",
          groupId: null,
          type: AccountType.LIABILITY,
        },
      ],
      equityAggregation,
      transactionGainLoss: 5,
      holdingGainLoss: 15,
      isBeforeAccountBookStart: false,
      endOfPeriodBalanceStats: {
        assets: 100,
        liabilities: 40,
        netWorth: 60,
        convertedBalanceByAccountId: new Map([
          ["asset-1", 100],
          ["liability-1", -40],
        ]),
      },
      bookingsCount: 5,
      convertedBookingsCount: 5,
      skippedBookingsCount: 0,
    });

    expect(response.stats).toMatchObject({
      income: 120,
      expenses: 20,
      savings: 100,
      gainsLosses: 30,
      totalReturn: 130,
      endOfPeriodAssets: 100,
      endOfPeriodLiabilities: 40,
      endOfPeriodNetWorth: 60,
    });
    expect(response.assetBreakdown.totalAmount).toBe(100);
    expect(response.liabilityBreakdown.totalAmount).toBe(40);
    expect(response.incomeBreakdown.totalAmount).toBe(120);
    expect(response.expenseBreakdown.totalAmount).toBe(20);
  });
});
