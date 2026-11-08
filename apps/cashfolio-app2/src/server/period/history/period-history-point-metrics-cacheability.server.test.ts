import { beforeEach, describe, expect, test } from "vitest";
import { EquityAccountSubtype, Unit } from "../../../.prisma-client/enums";
import type { Money, MoneyInput } from "../../../shared/money";
import { toMoney } from "../../../shared/money";
import {
  computePeriodHoldingGainLoss,
  convertBookingValueToReferenceDetails,
  createBaseData,
  getOrLoadPeriodBaseData,
  loadPeriodHistoryPointMetricsWithCacheability,
  processPeriodEquityBookingsFromBaseData,
  resetHistoryMetrics,
} from "./period-history-point-metrics.server.test-support";

describe("loadPeriodHistoryPointMetrics", () => {
  beforeEach(resetHistoryMetrics);

  test("marks metrics cacheable only when valuation sources are permanent", async () => {
    const baseData = createBaseData({
      overrides: {
        equityBookings: [
          {
            id: "booking-1",
            accountId: "income-1",
            accountName: "Income",
            accountGroupId: null,
            equityAccountSubtype: EquityAccountSubtype.INCOME,
            transactionId: "transaction-1",
            date: new Date("2026-02-10T00:00:00.000Z"),
            value: toMoney(100),
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ],
      },
    });
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        convertBookingToReference,
      }: {
        convertBookingToReference: (booking: {
          value: MoneyInput;
          unit: Unit;
          currency: string | null;
          cryptocurrency: string | null;
          symbol: string | null;
          tradeCurrency: string | null;
          date: Date;
        }) => Promise<Money | null>;
      }) => {
        await convertBookingToReference({
          value: toMoney(100),
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          date: new Date("2026-02-10T00:00:00.000Z"),
        });
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: toMoney(0),
      unrealizedGainLoss: toMoney(0),
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: toMoney(100),
      source: "provider",
    });

    const result = await loadPeriodHistoryPointMetricsWithCacheability({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(result.cacheableFromPermanentValuationCache).toBe(false);
  });
});
