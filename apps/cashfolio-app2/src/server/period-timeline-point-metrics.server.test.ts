import { describe, expect, test, vi } from "vitest";
import type { PeriodBaseData } from "./period-base-data-cache";

const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());
const processPeriodEquityBookingsFromBaseData = vi.hoisted(() => vi.fn());
const computePeriodHoldingGainLoss = vi.hoisted(() => vi.fn());
const convertBookingValueToReference = vi.hoisted(() => vi.fn());
const getUnitToReferenceExchangeRate = vi.hoisted(() => vi.fn());

vi.mock("./period-base-data-cache", () => ({
  getOrLoadPeriodBaseData,
}));

vi.mock("./period-equity-bookings", () => ({
  processPeriodEquityBookingsFromBaseData,
}));

vi.mock("./period-holding-gain-loss", () => ({
  computePeriodHoldingGainLoss,
}));

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));

import { loadPeriodTimelinePointMetrics } from "./period-timeline-point-metrics.server";

function createBaseData(args?: {
  isBefore?: boolean;
  selection?: Partial<PeriodBaseData["selection"]>;
}): PeriodBaseData {
  return {
    accountBookId: "book-1",
    periodValue: "2026-02",
    referenceCurrency: "CHF",
    selection: {
      periodValue: "2026-02",
      label: "February 2026",
      periodSpecifier: "month",
      granularity: "month",
      year: 2026,
      month: 2,
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T00:00:00.000Z"),
      queryEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialHoldingDate: new Date("2026-01-31T00:00:00.000Z"),
      isBeforeAccountBookStart: args?.isBefore ?? false,
      minPeriodDate: new Date("2026-01-01T00:00:00.000Z"),
      ...(args?.selection ?? {}),
    },
    allAccountGroups: [],
    baseAssetLiabilityAccounts: [],
    holdingAccountsResolved: [],
    endOfPeriodRawBalances: [],
    transferClearingUnitBuckets: [],
    equityBookings: [],
    explicitCounterparts: [],
    initialHoldingBalances: [],
    holdingTransactions: [],
  };
}

describe("loadPeriodTimelinePointMetrics", () => {
  test("returns zeros before account-book start without running metric pipelines", async () => {
    const baseData = createBaseData({ isBefore: true });

    getOrLoadPeriodBaseData.mockResolvedValue(baseData);

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(result).toEqual({
      totalReturn: 0,
      savings: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
    });
    expect(processPeriodEquityBookingsFromBaseData).not.toHaveBeenCalled();
    expect(computePeriodHoldingGainLoss).not.toHaveBeenCalled();
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
      realizedGainLoss: 7,
      unrealizedGainLoss: -2,
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReference.mockResolvedValue(1);
    getUnitToReferenceExchangeRate.mockResolvedValue(1);

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(getOrLoadPeriodBaseData).toHaveBeenCalledWith({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(processPeriodEquityBookingsFromBaseData).toHaveBeenCalledTimes(1);
    expect(computePeriodHoldingGainLoss).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      totalReturn: 135,
      savings: 100,
      income: 120,
      expenses: 20,
      gainsLosses: 35,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
    });
  });
});
