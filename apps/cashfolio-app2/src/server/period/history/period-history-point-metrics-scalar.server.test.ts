import { beforeEach, describe, expect, test } from "vitest";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import {
  computePeriodHoldingGainLoss,
  convertBookingValueToReferenceDetails,
  createBaseData,
  getOrLoadPeriodBaseData,
  getUnitToReferenceExchangeRateDetails,
  loadPeriodHistoryPointMetrics,
  processPeriodEquityBookingsFromBaseData,
  resetHistoryMetrics,
} from "./period-history-point-metrics.server.test-support";

describe("loadPeriodHistoryPointMetrics", () => {
  beforeEach(resetHistoryMetrics);

  test("returns zeros before account-book start without running metric pipelines", async () => {
    const baseData = createBaseData({ isBefore: true });

    getOrLoadPeriodBaseData.mockResolvedValue(baseData);

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result)).toEqual({
      totalReturn: 0,
      savings: 0,
      cashFlow: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      scopeOptions: {
        cashFlow: [],
        income: [],
        expenses: [],
        gainsLosses: [],
        netWorth: [],
      },
      scopedMetricValue: undefined,
    });
    expect(processPeriodEquityBookingsFromBaseData).not.toHaveBeenCalled();
    expect(computePeriodHoldingGainLoss).not.toHaveBeenCalled();
  });

  test("returns scoped metric value zero before account-book start when scope filter is requested", async () => {
    const baseData = createBaseData({ isBefore: true });

    getOrLoadPeriodBaseData.mockResolvedValue(baseData);

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "expenses",
        scope: "total",
      },
    });

    expect(toNumericMoney(result.scopedMetricValue)).toBe(0);
  });

  test("loads scalar metrics from shared equity + holdings pipelines", async () => {
    const baseData = createBaseData();
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
        };
      }) => {
        equityAggregation.income = 120;
        equityAggregation.expenses = 20;
        equityAggregation.explicitGainLoss = 30;
        return {
          bookingsCount: 3,
          convertedCount: 3,
          skippedCount: 0,
        };
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: toMoney(7),
      unrealizedGainLoss: toMoney(-2),
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: toMoney(1),
      source: "identity",
    });
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: toMoney(1),
      source: "identity",
    });

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(getOrLoadPeriodBaseData).toHaveBeenCalledWith({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(processPeriodEquityBookingsFromBaseData).toHaveBeenCalledTimes(1);
    expect(computePeriodHoldingGainLoss).toHaveBeenCalledTimes(1);
    expect(toNumericMoney(result)).toEqual({
      totalReturn: 135,
      savings: 100,
      cashFlow: 0,
      income: 120,
      expenses: 20,
      gainsLosses: 35,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      scopeOptions: {
        cashFlow: [],
        income: [],
        expenses: [],
        gainsLosses: [],
        netWorth: [],
      },
      scopedMetricValue: undefined,
    });
  });
});
