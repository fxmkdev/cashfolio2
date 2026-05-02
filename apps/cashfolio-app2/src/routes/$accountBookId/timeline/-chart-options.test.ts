import type { MantineTheme } from "@mantine/core";
import { describe, expect, test } from "vitest";
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
  rebaseTimelineChartDataCumulativeToVisibleRange,
} from "./-chart-options";

const mockTheme = {
  primaryColor: "blue",
  primaryShade: {
    light: 6,
    dark: 8,
  },
  white: "#ffffff",
  black: "#000000",
  colors: {
    blue: [
      "#f0f4ff",
      "#e0e7ff",
      "#c7d2fe",
      "",
      "",
      "",
      "#2563eb",
      "#1d4ed8",
      "#1e40af",
      "#172554",
    ],
    green: ["", "", "", "", "", "#2f9e44", "#2b8a3e"],
    red: ["", "", "", "", "", "#f03e3e", "#e03131"],
    gray: [
      "#f8f9fa",
      "#f1f3f5",
      "#e9ecef",
      "#dee2e6",
      "#ced4da",
      "#adb5bd",
      "#868e96",
      "#343a40",
    ],
    dark: [
      "",
      "",
      "#6c757d",
      "#495057",
      "#3b3f44",
      "#2f3338",
      "#26292e",
      "#1f2226",
    ],
  },
} as unknown as MantineTheme;

const mockColors = {
  chartTextColor: "#111",
  themeBorderColor: "#222",
  tooltipBackgroundColor: "#333",
  tooltipTextColor: "#444",
  tooltipSubtleTextColor: "#555",
  incomeFillColor: "#666",
  incomeStrokeColor: "#777",
  expenseFillColor: "#888",
  expenseStrokeColor: "#999",
  netStrokeColor: "#aaa",
  positiveMarkerColor: "#bbb",
  negativeMarkerColor: "#ccc",
  zeroLineColor: "#ddd",
};

describe("mapTimelinePointsToChartData", () => {
  test("maps timeline points to chart datum shape with UTC bounds", () => {
    expect(
      mapTimelinePointsToChartData([
        {
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 10,
          savings: 7,
          income: 11,
          expenses: 4,
          gainsLosses: 3,
        },
        {
          periodValue: "2026",
          periodLabel: "2026",
          totalReturn: 12,
          savings: 9,
          income: 14,
          expenses: 5,
          gainsLosses: 3,
        },
      ]),
    ).toEqual([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
        cumulativeMetric: 0,
      },
      {
        periodValue: "2026",
        periodLabel: "2026",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEndExclusive: new Date("2027-01-01T00:00:00.000Z"),
        totalReturn: 12,
        savings: 9,
        income: 14,
        expenses: 5,
        gainsLosses: 3,
        cumulativeMetric: 0,
      },
    ]);
  });

  test("skips points with invalid period values", () => {
    expect(
      mapTimelinePointsToChartData([
        {
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 10,
          savings: 7,
          income: 11,
          expenses: 4,
          gainsLosses: 3,
        },
        {
          periodValue: "invalid-period",
          periodLabel: "Invalid",
          totalReturn: 12,
          savings: 9,
          income: 14,
          expenses: 5,
          gainsLosses: 3,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        periodValue: "2026-01",
        cumulativeMetric: 0,
      }),
    ]);
  });
});

describe("rebaseTimelineChartDataCumulativeToVisibleRange", () => {
  test("rebases using the selected metric", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 100,
        savings: 40,
        income: 120,
        expenses: 80,
        gainsLosses: 60,
      },
      {
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: -25,
        savings: -5,
        income: 90,
        expenses: 95,
        gainsLosses: -20,
      },
      {
        periodValue: "2026-03",
        periodLabel: "March 2026",
        totalReturn: 10,
        savings: 3,
        income: 80,
        expenses: 77,
        gainsLosses: 7,
      },
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

  test("falls back to full-range cumulative values when range is invalid", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 5,
        savings: 2,
        income: 8,
        expenses: 6,
        gainsLosses: 3,
      },
      {
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 7,
        savings: 1,
        income: 7,
        expenses: 6,
        gainsLosses: 6,
      },
    ]);

    expect(
      rebaseTimelineChartDataCumulativeToVisibleRange({
        chartData,
        visibleRangeX: {
          start: "not-a-date",
          end: undefined,
        },
        selectedMetric: "savings",
      }),
    ).toEqual([
      expect.objectContaining({ periodValue: "2026-01", cumulativeMetric: 2 }),
      expect.objectContaining({ periodValue: "2026-02", cumulativeMetric: 3 }),
    ]);
  });

  test("treats partially overlapping periods as visible when rebasing", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 100,
        savings: 20,
        income: 50,
        expenses: 30,
        gainsLosses: 80,
      },
      {
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: 50,
        savings: 10,
        income: 40,
        expenses: 30,
        gainsLosses: 40,
      },
    ]);

    expect(
      rebaseTimelineChartDataCumulativeToVisibleRange({
        chartData,
        visibleRangeX: {
          start: new Date("2026-01-15T00:00:00.000Z"),
          end: new Date("2026-02-28T00:00:00.000Z"),
        },
        selectedMetric: "expenses",
      }),
    ).toEqual([
      expect.objectContaining({ periodValue: "2026-01", cumulativeMetric: 30 }),
      expect.objectContaining({ periodValue: "2026-02", cumulativeMetric: 60 }),
    ]);
  });
});

describe("createTimelineChartOptions", () => {
  test("enables navigator, legend, and monthly range controls", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
      },
      {
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: -5,
        savings: -3,
        income: 4,
        expenses: 7,
        gainsLosses: -2,
      },
    ]);

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "month",
      selectedMetric: "totalReturn",
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

    expect(options.navigator).toEqual({
      enabled: true,
      miniChart: {
        enabled: false,
      },
    });
    expect(options.legend).toEqual({
      enabled: true,
    });
    expect(options.ranges).toEqual({
      enabled: true,
      buttons: [
        { label: "6M", value: { unit: "month", step: 6 } },
        { label: "1Y", value: "year" },
        { label: "3Y", value: { unit: "year", step: 3 } },
        { label: "All", value: undefined },
      ],
      fill: "#ffffff",
      stroke: "#ced4da",
      textColor: "#343a40",
      active: {
        fill: "#e0e7ff",
        stroke: "#2563eb",
        textColor: "#1d4ed8",
      },
      hover: {
        fill: "#f8f9fa",
        stroke: "#adb5bd",
        textColor: "#000000",
      },
      disabled: {
        fill: "#f1f3f5",
        stroke: "#dee2e6",
        textColor: "#adb5bd",
      },
    });

    expect(options.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "bar",
          yKey: "totalReturn",
          yName: "Total Return",
        }),
        expect.objectContaining({
          type: "line",
          yKey: "cumulativeMetric",
          yName: "Cumulative Total Return",
        }),
      ]),
    );
  });

  test("uses selected metric for bar and cumulative line labels", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
      },
    ]);

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

    const series = Array.isArray(options.series) ? options.series : [];
    expect(series[0]).toMatchObject({
      yKey: "savings",
      yName: "Savings",
    });
    expect(series[1]).toMatchObject({
      yKey: "cumulativeMetric",
      yName: "Cumulative Savings",
    });
  });

  test("forces expense bars to red even for positive values", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
      },
    ]);

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "month",
      selectedMetric: "expenses",
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

    const series = (
      Array.isArray(options.series) ? options.series[0] : undefined
    ) as
      | {
          itemStyler?: (params: unknown) => unknown;
        }
      | undefined;
    const itemStyler = series?.itemStyler;
    if (!itemStyler) {
      throw new Error("Expected itemStyler");
    }

    expect(
      itemStyler({
        datum: chartData[0],
      } as never),
    ).toEqual({
      fill: "#e03131",
      stroke: "#e03131",
    });
  });
});
