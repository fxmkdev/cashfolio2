import type { MantineTheme } from "@mantine/core";
import { describe, expect, test } from "vitest";
import {
  createTimelineChartOptions,
  getDefaultRangeButtonLabel,
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
        },
        {
          periodValue: "2026",
          periodLabel: "2026",
          totalReturn: 12,
        },
      ]),
    ).toEqual([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
        totalReturn: 10,
      },
      {
        periodValue: "2026",
        periodLabel: "2026",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEndExclusive: new Date("2027-01-01T00:00:00.000Z"),
        totalReturn: 12,
      },
    ]);
  });
});

describe("createTimelineChartOptions", () => {
  test("returns default range button labels by period mode", () => {
    expect(getDefaultRangeButtonLabel("month")).toBe("1Y");
    expect(getDefaultRangeButtonLabel("year")).toBe("5Y");
  });

  test("enables navigator and monthly range controls", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
      },
      {
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: -5,
      },
    ]);

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "month",
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

  test("highlights the current period band using time bounds", () => {
    const chartData = mapTimelinePointsToChartData([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
      },
      {
        periodValue: "2026-02",
        periodLabel: "February 2026",
        totalReturn: -5,
      },
    ]);

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "month",
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
      },
      {
        periodValue: "2024",
        periodLabel: "2024",
        totalReturn: 12,
      },
    ]);

    const options = createTimelineChartOptions({
      chartData,
      periodMode: "year",
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
