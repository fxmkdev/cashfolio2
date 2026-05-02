import type { MantineTheme } from "@mantine/core";
import { describe, expect, test } from "vitest";
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
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
  test("maps timeline points to chart datum shape with UTC period bounds", () => {
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
      },
    ]);
  });
});

describe("createTimelineChartOptions", () => {
  test("enables navigator and monthly range controls", () => {
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
    expect(options.initialState).toBeUndefined();
    expect(options.axes?.x?.type).toBe("unit-time");
    expect(options.axes?.x).toMatchObject({
      unit: { unit: "month", utc: true },
    });
  });

  test("uses selected metric for y key and tooltip label", () => {
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

    const series = (
      Array.isArray(options.series) ? options.series[0] : undefined
    ) as
      | {
          yKey: string;
          yName: string;
          tooltip?: { renderer?: (params: unknown) => unknown };
        }
      | undefined;
    expect(series).toMatchObject({
      yKey: "savings",
      yName: "Savings",
    });

    const tooltipRenderer = series?.tooltip?.renderer;
    if (!tooltipRenderer) {
      throw new Error("Expected tooltip renderer");
    }

    expect(
      tooltipRenderer({
        datum: chartData[0],
      } as never),
    ).toEqual({
      heading: "January 2026",
      data: [
        {
          label: "Savings",
          value: new Intl.NumberFormat("en-CH", {
            style: "currency",
            currency: "CHF",
          }).format(7),
        },
      ],
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

  test("highlights the current period band using time bounds", () => {
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

    expect(options.axes?.x?.crossLines).toEqual([
      {
        type: "range",
        range: [
          new Date("2026-02-01T00:00:00.000Z"),
          new Date("2026-03-01T00:00:00.000Z"),
        ],
        fill: "#e9ecef",
        fillOpacity: 0.45,
        strokeWidth: 0,
      },
    ]);
  });

  test("uses yearly mode range controls when selected", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2023",
        periodLabel: "2023",
        totalReturn: 10,
        savings: 7,
        income: 11,
        expenses: 4,
        gainsLosses: 3,
      },
      {
        periodValue: "2024",
        periodLabel: "2024",
        totalReturn: 12,
        savings: 9,
        income: 14,
        expenses: 5,
        gainsLosses: 3,
      },
    ]);

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "year",
      selectedMetric: "gainsLosses",
      amountCompactFormatter: new Intl.NumberFormat("en-CH", {
        notation: "compact",
      }),
      currencyFormatter: new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: "CHF",
      }),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: true,
    });

    expect(options.ranges).toEqual({
      enabled: true,
      buttons: [
        { label: "3Y", value: { unit: "year", step: 3 } },
        { label: "5Y", value: { unit: "year", step: 5 } },
        { label: "10Y", value: { unit: "year", step: 10 } },
        { label: "All", value: undefined },
      ],
      fill: "#26292e",
      stroke: "#495057",
      textColor: "#e9ecef",
      active: {
        fill: "#1e40af",
        stroke: "#1d4ed8",
        textColor: "#ffffff",
      },
      hover: {
        fill: "#2f3338",
        stroke: "#6c757d",
        textColor: "#ffffff",
      },
      disabled: {
        fill: "#1f2226",
        stroke: "#3b3f44",
        textColor: "#868e96",
      },
    });
    expect(options.axes?.x?.type).toBe("unit-time");
    expect(options.axes?.x).toMatchObject({
      unit: { unit: "year", utc: true },
    });
    expect(options.initialState).toBeUndefined();
  });

  test("omits period band highlight when data is empty", () => {
    const options = createTimelineChartOptions({
      chartData: [],
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
      isDarkMode: true,
    });

    expect(options.axes?.x?.crossLines).toBeUndefined();
    expect(options.initialState).toBeUndefined();
  });
});
