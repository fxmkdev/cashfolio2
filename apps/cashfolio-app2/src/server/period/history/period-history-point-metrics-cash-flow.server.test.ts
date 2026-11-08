import { beforeEach, describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import {
  computePeriodHoldingGainLoss,
  convertBookingValueToReferenceDetails,
  createBaseData,
  getOrLoadPeriodBaseData,
  getUnitToReferenceExchangeRateDetails,
  loadPeriodHistoryPointMetricsWithCacheability,
  processPeriodEquityBookingsFromBaseData,
  resetHistoryMetrics,
} from "./period-history-point-metrics.server.test-support";

describe("loadPeriodHistoryPointMetrics", () => {
  beforeEach(resetHistoryMetrics);

  test("computes cash flow from cash-flow transactions with reference conversion details", async () => {
    const baseData = createBaseData({
      overrides: {
        cashFlowTransactions: [
          {
            id: "tx-salary",
            bookings: [
              {
                id: "cash-booking",
                date: new Date("2026-02-10T00:00:00.000Z"),
                value: toMoney(70),
                unit: Unit.CURRENCY,
                currency: "USD",
                cryptocurrency: null,
                symbol: null,
                tradeCurrency: null,
                account: {
                  id: "cash-a",
                  name: "Cash A",
                  groupId: null,
                  type: AccountType.BALANCE,
                  isCashAccount: true,
                },
              },
              {
                id: "income-booking",
                date: new Date("2026-02-10T00:00:00.000Z"),
                value: toMoney(-70),
                unit: Unit.CURRENCY,
                currency: "USD",
                cryptocurrency: null,
                symbol: null,
                tradeCurrency: null,
                account: {
                  id: "income-a",
                  name: "Income A",
                  groupId: null,
                  type: AccountType.EQUITY,
                  isCashAccount: false,
                },
              },
            ],
          },
        ],
      },
    });
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockResolvedValue({
      bookingsCount: 0,
      convertedCount: 0,
      skippedCount: 0,
    });
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: toMoney(0),
      unrealizedGainLoss: toMoney(0),
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockImplementation(
      async ({ value }: { value: number }) => ({
        value: toMoney(value * 2),
        source: "timeSeries",
      }),
    );
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: toMoney(1),
      source: "identity",
    });

    const result = await loadPeriodHistoryPointMetricsWithCacheability({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result.metrics.cashFlow)).toBe(140);
    expect(toNumericMoney(result.metrics.scopeOptions.cashFlow)).toEqual([
      {
        value: "account:cash-a",
        label: "Cash A",
        kind: "account",
        treeLabel: "Cash A",
      },
    ]);
    expect(result.cacheableFromPermanentValuationCache).toBe(true);
    expect(convertBookingValueToReferenceDetails).toHaveBeenCalledWith({
      value: toMoney(70),
      unit: Unit.CURRENCY,
      currency: "USD",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      date: new Date("2026-02-10T00:00:00.000Z"),
      referenceCurrency: "CHF",
      exchangeRateByKey: expect.any(Map),
    });
  });
});
