import { describe, expect, test } from "vitest";
import {
  mapTimelinePointsToChartData,
  prependOpeningBalanceChartDatum,
} from "./-chart-options";
import { createTimelinePoint } from "./-chart-test-helpers";

describe("mapTimelinePointsToChartData", () => {
  test("maps timeline points to chart datum shape with UTC bounds", () => {
    expect(
      mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 10,
          savings: 7,
          income: 11,
          expenses: 4,
          gainsLosses: 3,
          assets: 150,
          liabilities: 40,
          netWorth: 110,
        }),
      ]),
    ).toEqual([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
        periodMetricDate: new Date("2026-01-31T00:00:00.000Z"),
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
        assets: 150,
        liabilities: 40,
        netWorth: 110,
        netWorthPositive: 110,
        netWorthNegative: null,
        cumulativeMetric: 0,
        rollingAverageMetric: null,
      },
    ]);
  });

  test("keeps net worth zero in positive split to avoid gaps at zero", () => {
    expect(
      mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          assets: 10,
          liabilities: 10,
          netWorth: 0,
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        netWorth: 0,
        netWorthPositive: 0,
        netWorthNegative: null,
      }),
    ]);
  });

  test("skips points with invalid period values", () => {
    expect(
      mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 10,
          savings: 7,
          income: 11,
          expenses: 4,
          gainsLosses: 3,
        }),
        createTimelinePoint({
          periodValue: "invalid-period",
          periodLabel: "Invalid",
          totalReturn: 12,
          savings: 9,
          income: 14,
          expenses: 5,
          gainsLosses: 3,
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        periodValue: "2026-01",
        cumulativeMetric: 0,
      }),
    ]);
  });
});

describe("prependOpeningBalanceChartDatum", () => {
  test("prepends opening-balance point for area metrics", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
        assets: 120,
        liabilities: 40,
        netWorth: 80,
      }),
    ]);

    const result = prependOpeningBalanceChartDatum({
      chartData,
      selectedMetric: "assets",
      openingBalancePoint: {
        date: "2025-12-31T00:00:00.000Z",
        label: "Opening Balance",
        assets: 100,
        liabilities: 35,
        netWorth: 65,
      },
    });

    expect(result[0]).toEqual(
      expect.objectContaining({
        periodLabel: "Opening Balance",
        periodStart: new Date("2025-12-31T00:00:00.000Z"),
        assets: 100,
        liabilities: 35,
        netWorth: 65,
      }),
    );
    expect(result).toHaveLength(2);
  });

  test("does not prepend opening-balance point for bar metrics", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
      }),
    ]);

    const result = prependOpeningBalanceChartDatum({
      chartData,
      selectedMetric: "savings",
      openingBalancePoint: {
        date: "2025-12-31T00:00:00.000Z",
        label: "Opening Balance",
        assets: 100,
        liabilities: 35,
        netWorth: 65,
      },
    });

    expect(result).toEqual(chartData);
  });

  test("prepends opening balance when it is after periodStart but before period end", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        periodEndDate: "2026-01-31T00:00:00.000Z",
        totalReturn: 1,
        savings: 1,
        income: 1,
        expenses: 0,
        gainsLosses: 0,
      }),
    ]);

    const result = prependOpeningBalanceChartDatum({
      chartData,
      selectedMetric: "assets",
      openingBalancePoint: {
        date: "2026-01-15T00:00:00.000Z",
        label: "Opening Balance",
        assets: 10,
        liabilities: 5,
        netWorth: 5,
      },
    });

    expect(result[0]).toEqual(
      expect.objectContaining({
        periodLabel: "Opening Balance",
        periodMetricDate: new Date("2026-01-15T00:00:00.000Z"),
      }),
    );
    expect(result).toHaveLength(2);
  });
});
