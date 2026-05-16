import { describe, expect, test } from "vitest";
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
} from "./-chart-options";
import {
  createTimelinePoint,
  mockColors,
  mockTheme,
} from "./-chart-test-helpers";

describe("createTimelineChartOptions (balance metrics)", () => {
  test("renders assets as green area without cumulative line", () => {
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
        liabilities: 50,
        netWorth: 70,
      }),
    ]);
    const options = createTimelineChartOptions({
      chartData,
      periodMode: "month",
      selectedMetric: "assets",
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

    const series = Array.isArray(options.series) ? options.series : [];
    expect(series).toHaveLength(1);
    expect(options.axes?.x).toMatchObject({
      type: "time",
      nice: false,
      max: new Date("2026-01-31T00:00:00.000Z"),
      crossLines: [
        expect.objectContaining({
          range: [
            new Date("2026-01-01T00:00:00.000Z"),
            new Date("2026-01-31T00:00:00.000Z"),
          ],
        }),
      ],
    });
    expect(series[0]).toMatchObject({
      type: "area",
      yKey: "assets",
      yName: "Assets",
      stroke: "#2b8a3e",
      fill: "#2b8a3e",
    });

    const areaSeries = series[0] as {
      tooltip?: {
        renderer?: (params: { datum: unknown }) => { heading: string };
      };
    };
    const tooltip = areaSeries.tooltip?.renderer?.({
      datum: chartData[0],
    });
    expect(tooltip?.heading).toBe("01/31/2026");
  });

  test("does not render rolling-average series for balance metrics", () => {
    const options = createTimelineChartOptions({
      chartData: mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          assets: 120,
        }),
      ]),
      periodMode: "month",
      selectedMetric: "assets",
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

    const series = Array.isArray(options.series) ? options.series : [];
    expect(
      series.some(
        (entry) =>
          entry.type === "line" &&
          "yKey" in entry &&
          entry.yKey === "rollingAverageMetric",
      ),
    ).toBe(false);
  });

  test("renders net worth as sign-split areas without cumulative line", () => {
    const options = createTimelineChartOptions({
      chartData: mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 1,
          savings: 1,
          income: 2,
          expenses: 1,
          gainsLosses: 0,
          assets: 100,
          liabilities: 130,
          netWorth: -30,
        }),
        createTimelinePoint({
          periodValue: "2026-02",
          periodLabel: "February 2026",
          totalReturn: 2,
          savings: 2,
          income: 3,
          expenses: 1,
          gainsLosses: 0,
          assets: 150,
          liabilities: 120,
          netWorth: 30,
        }),
      ]),
      periodMode: "month",
      selectedMetric: "netWorth",
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

    const series = Array.isArray(options.series) ? options.series : [];
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ type: "area", yKey: "netWorthPositive" });
    expect(series[1]).toMatchObject({
      type: "area",
      yKey: "netWorthNegative",
      showInLegend: false,
    });
  });

  test("forces y-axis to include zero for positive-only metrics", () => {
    const options = createTimelineChartOptions({
      chartData: mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          liabilities: 30,
        }),
        createTimelinePoint({
          periodValue: "2026-02",
          periodLabel: "February 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          liabilities: 45,
        }),
      ]),
      periodMode: "month",
      selectedMetric: "liabilities",
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

    expect(options.axes?.y).toMatchObject({ min: 0, max: 45 });
  });

  test("forces y-axis to include zero for negative-only metrics", () => {
    const options = createTimelineChartOptions({
      chartData: mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          netWorth: -20,
        }),
        createTimelinePoint({
          periodValue: "2026-02",
          periodLabel: "February 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          netWorth: -15,
        }),
      ]),
      periodMode: "month",
      selectedMetric: "netWorth",
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

    expect(options.axes?.y).toMatchObject({ min: -20, max: 0 });
  });
});
