import { describe, expect, test } from "vitest";
import {
  addRollingAverageMetricToChartData,
  mapTimelinePointsToChartData,
  rebaseTimelineChartDataCumulativeToVisibleRange,
} from "./-chart-options";
import { createTimelinePoint } from "./-chart-test-helpers";

describe("rebaseTimelineChartDataCumulativeToVisibleRange", () => {
  test("rebases cumulative values to visible range", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 100,
        savings: 40,
        income: 120,
        expenses: 80,
        gainsLosses: 60,
      }),
      createTimelinePoint({
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: -25,
        savings: -5,
        income: 90,
        expenses: 95,
        gainsLosses: -20,
      }),
      createTimelinePoint({
        periodValue: "2026-03",
        periodLabel: "March 2026",
        totalReturn: 10,
        savings: 3,
        income: 80,
        expenses: 77,
        gainsLosses: 7,
      }),
    ]);

    expect(
      rebaseTimelineChartDataCumulativeToVisibleRange({
        chartData,
        visibleRangeX: {
          start: new Date("2026-02-01T00:00:00.000Z"),
          end: new Date("2026-03-01T00:00:00.000Z"),
        },
        selectedMetric: "income",
      }),
    ).toEqual([
      expect.objectContaining({ periodValue: "2026-01", cumulativeMetric: 0 }),
      expect.objectContaining({ periodValue: "2026-02", cumulativeMetric: 90 }),
      expect.objectContaining({
        periodValue: "2026-03",
        cumulativeMetric: 170,
      }),
    ]);
  });

  test("treats partially overlapping periods as visible for rebasing", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 0,
        savings: 0,
        income: 100,
        expenses: 0,
        gainsLosses: 0,
      }),
      createTimelinePoint({
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 0,
        savings: 0,
        income: 50,
        expenses: 0,
        gainsLosses: 0,
      }),
    ]);

    const result = rebaseTimelineChartDataCumulativeToVisibleRange({
      chartData,
      visibleRangeX: {
        start: new Date("2026-01-15T00:00:00.000Z"),
        end: new Date("2026-02-15T00:00:00.000Z"),
      },
      selectedMetric: "income",
    });

    expect(result[0]).toEqual(
      expect.objectContaining({ cumulativeMetric: 100 }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ cumulativeMetric: 150 }),
    );
  });

  test("falls back to full-range rebasing for invalid visible-range values", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 0,
        savings: 0,
        income: 10,
        expenses: 0,
        gainsLosses: 0,
      }),
      createTimelinePoint({
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 0,
        savings: 0,
        income: 20,
        expenses: 0,
        gainsLosses: 0,
      }),
    ]);

    const result = rebaseTimelineChartDataCumulativeToVisibleRange({
      chartData,
      visibleRangeX: { start: "not-a-date", end: Number.POSITIVE_INFINITY },
      selectedMetric: "income",
    });

    expect(result).toEqual([
      expect.objectContaining({ cumulativeMetric: 10 }),
      expect.objectContaining({ cumulativeMetric: 30 }),
    ]);
  });
});

describe("addRollingAverageMetricToChartData", () => {
  test("includes the same period for the first plotted rolling-average point", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 10,
        income: 10,
        expenses: 0,
        gainsLosses: 0,
      }),
      createTimelinePoint({
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 30,
        savings: 30,
        income: 30,
        expenses: 0,
        gainsLosses: 0,
      }),
    ]);

    const result = addRollingAverageMetricToChartData({
      chartData,
      selectedMetric: "income",
      periodMode: "month",
    });

    expect(result[0]).toEqual(
      expect.objectContaining({
        rollingAverageMetric: 10,
      }),
    );
  });

  test("omits rolling-average point for current period", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 10,
        income: 10,
        expenses: 0,
        gainsLosses: 0,
      }),
      createTimelinePoint({
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 20,
        savings: 20,
        income: 20,
        expenses: 0,
        gainsLosses: 0,
      }),
      createTimelinePoint({
        periodValue: "2026-03",
        periodLabel: "March 2026",
        totalReturn: 30,
        savings: 30,
        income: 30,
        expenses: 0,
        gainsLosses: 0,
      }),
    ]);

    const result = addRollingAverageMetricToChartData({
      chartData,
      selectedMetric: "income",
      periodMode: "month",
    });

    expect(result.at(-1)).toEqual(
      expect.objectContaining({
        rollingAverageMetric: null,
      }),
    );
  });

  test("includes the same period in the rolling window for plotted points", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 10,
        income: 10,
        expenses: 0,
        gainsLosses: 0,
      }),
      createTimelinePoint({
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 30,
        savings: 30,
        income: 30,
        expenses: 0,
        gainsLosses: 0,
      }),
      createTimelinePoint({
        periodValue: "2026-03",
        periodLabel: "March 2026",
        totalReturn: 50,
        savings: 50,
        income: 50,
        expenses: 0,
        gainsLosses: 0,
      }),
    ]);

    const result = addRollingAverageMetricToChartData({
      chartData,
      selectedMetric: "income",
      periodMode: "month",
    });

    expect(result[1]).toEqual(
      expect.objectContaining({
        rollingAverageMetric: 20,
      }),
    );
  });

  test("uses trailing 12-month window in monthly mode", () => {
    const periodValues = [
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ];
    const chartData = mapTimelinePointsToChartData(
      periodValues.map((periodValue, index) =>
        createTimelinePoint({
          periodValue,
          periodLabel: `Period ${index + 1}`,
          totalReturn: 0,
          savings: 0,
          income: index + 1,
          expenses: 0,
          gainsLosses: 0,
        }),
      ),
    );

    const result = addRollingAverageMetricToChartData({
      chartData,
      selectedMetric: "income",
      periodMode: "month",
    });

    expect(result[12]).toEqual(
      expect.objectContaining({
        rollingAverageMetric: 7.5,
      }),
    );
  });

  test("uses trailing 5-year window in yearly mode", () => {
    const chartData = mapTimelinePointsToChartData(
      Array.from({ length: 7 }, (_, index) =>
        createTimelinePoint({
          periodValue: String(2020 + index),
          periodLabel: String(2020 + index),
          totalReturn: 0,
          savings: 0,
          income: (index + 1) * 10,
          expenses: 0,
          gainsLosses: 0,
        }),
      ),
    );

    const result = addRollingAverageMetricToChartData({
      chartData,
      selectedMetric: "income",
      periodMode: "year",
    });

    expect(result[5]).toEqual(
      expect.objectContaining({
        rollingAverageMetric: 40,
      }),
    );
  });

  test("does not add rolling-average values for balance metrics", () => {
    const chartData = mapTimelinePointsToChartData([
      createTimelinePoint({
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 0,
        savings: 0,
        income: 0,
        expenses: 0,
        gainsLosses: 0,
        netWorth: 50,
      }),
      createTimelinePoint({
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 0,
        savings: 0,
        income: 0,
        expenses: 0,
        gainsLosses: 0,
        netWorth: 60,
      }),
    ]);

    const result = addRollingAverageMetricToChartData({
      chartData,
      selectedMetric: "netWorth",
      periodMode: "month",
    });

    expect(result).toEqual(chartData);
  });
});
