import { describe, expect, test } from "vitest";
import {
  addRollingAverageMetricToChartData,
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
  rebaseTimelineChartDataCumulativeToVisibleRange,
} from "./-chart-options";
import {
  createTimelinePoint,
  mockColors,
  mockTheme,
} from "./-chart-test-helpers";

describe("createTimelineChartOptions (flow metrics)", () => {
  test("uses bar + cumulative line for non-cumulative metrics", () => {
    const chartData = rebaseTimelineChartDataCumulativeToVisibleRange({
      chartData: addRollingAverageMetricToChartData({
        chartData: mapTimelinePointsToChartData([
          createTimelinePoint({
            periodValue: "2026-01",
            periodLabel: "January 2026",
            totalReturn: 10,
            savings: 7,
            income: 11,
            expenses: 4,
            gainsLosses: 3,
          }),
        ]),
        selectedMetric: "savings",
        periodMode: "month",
      }),
      visibleRangeX: null,
      selectedMetric: "savings",
    });

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "month",
      selectedMetric: "savings",
      amountCompactFormatter: new Intl.NumberFormat("en-CH", {
        notation: "compact",
      }),
      currencyFormatter: new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: "CHF",
      }),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: false,
    });

    expect(options.legend).toEqual({ enabled: true });
    expect(options.navigator).toMatchObject({
      enabled: true,
      miniChart: { enabled: false },
    });
    expect(options.ranges).toMatchObject({
      enabled: true,
      buttons: [
        { label: "6M", value: { unit: "month", step: 6 } },
        { label: "1Y", value: "year" },
        { label: "3Y", value: { unit: "year", step: 3 } },
        { label: "All", value: undefined },
      ],
    });
    expect(options.axes?.x).toMatchObject({
      type: "unit-time",
      unit: { unit: "month", utc: true },
      nice: undefined,
      max: undefined,
      crossLines: [
        expect.objectContaining({
          type: "range",
          range: [
            new Date("2026-01-01T00:00:00.000Z"),
            new Date("2026-02-01T00:00:00.000Z"),
          ],
        }),
      ],
    });
    const series = Array.isArray(options.series) ? options.series : [];
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({
      type: "bar",
      yKey: "savings",
      yName: "Savings",
    });
    expect(series[1]).toMatchObject({
      type: "line",
      yKey: "rollingAverageMetric",
      yName: "12M Rolling Avg Savings",
    });
    expect(series.at(-1)).toMatchObject({
      type: "line",
      yKey: "cumulativeMetric",
      yName: "Cumulative Savings",
      visible: false,
    });
  });

  test("uses yearly range buttons in year mode", () => {
    const options = createTimelineChartOptions({
      chartData: addRollingAverageMetricToChartData({
        chartData: mapTimelinePointsToChartData([
          createTimelinePoint({
            periodValue: "2024",
            periodLabel: "2024",
            totalReturn: 1,
            savings: 1,
            income: 1,
            expenses: 0,
            gainsLosses: 0,
          }),
          createTimelinePoint({
            periodValue: "2025",
            periodLabel: "2025",
            totalReturn: 2,
            savings: 2,
            income: 2,
            expenses: 0,
            gainsLosses: 0,
          }),
        ]),
        selectedMetric: "income",
        periodMode: "year",
      }),
      periodMode: "year",
      selectedMetric: "income",
      amountCompactFormatter: new Intl.NumberFormat("en-CH", {
        notation: "compact",
      }),
      currencyFormatter: new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: "CHF",
      }),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: false,
    });

    expect(options.ranges).toMatchObject({
      buttons: [
        { label: "3Y", value: { unit: "year", step: 3 } },
        { label: "5Y", value: { unit: "year", step: 5 } },
        { label: "10Y", value: { unit: "year", step: 10 } },
        { label: "All", value: undefined },
      ],
    });
    expect(options.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          yKey: "rollingAverageMetric",
          yName: "5Y Rolling Avg Income",
        }),
      ]),
    );
  });

  test("keeps cumulative line visible when explicitly enabled", () => {
    const chartData = rebaseTimelineChartDataCumulativeToVisibleRange({
      chartData: mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 10,
          savings: 7,
          income: 11,
          expenses: 4,
          gainsLosses: 3,
        }),
      ]),
      visibleRangeX: null,
      selectedMetric: "savings",
    });

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "month",
      selectedMetric: "savings",
      showCumulativeSeries: true,
      amountCompactFormatter: new Intl.NumberFormat("en-CH", {
        notation: "compact",
      }),
      currencyFormatter: new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: "CHF",
      }),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: false,
    });

    expect(options.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "line",
          yKey: "cumulativeMetric",
          visible: true,
        }),
        expect.objectContaining({
          type: "line",
          yKey: "rollingAverageMetric",
          yName: "12M Rolling Avg Savings",
        }),
      ]),
    );
  });

  test("keeps bar charts dynamic while clamping zero baseline for positive-only data", () => {
    const options = createTimelineChartOptions({
      chartData: [
        {
          ...mapTimelinePointsToChartData([
            createTimelinePoint({
              periodValue: "2026-01",
              periodLabel: "January 2026",
              totalReturn: 0,
              savings: 20,
              income: 0,
              expenses: 0,
              gainsLosses: 0,
            }),
          ])[0],
          cumulativeMetric: 250,
        },
      ],
      periodMode: "month",
      selectedMetric: "savings",
      amountCompactFormatter: new Intl.NumberFormat("en-CH", {
        notation: "compact",
      }),
      currencyFormatter: new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: "CHF",
      }),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: false,
    });

    expect(options.axes?.y).toMatchObject({ min: 0 });
    expect(options.axes?.y).not.toMatchObject({ max: 250 });
  });

  test("omits current-period crossline when chart data is empty", () => {
    const options = createTimelineChartOptions({
      chartData: [],
      periodMode: "month",
      selectedMetric: "income",
      amountCompactFormatter: new Intl.NumberFormat("en-CH", {
        notation: "compact",
      }),
      currencyFormatter: new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: "CHF",
      }),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: false,
    });

    expect(options.axes?.x).toMatchObject({
      crossLines: undefined,
    });
  });
});
