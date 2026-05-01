import type { MantineTheme } from "@mantine/core";
import { describe, expect, test } from "vitest";
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
} from "./-chart-options";

const mockTheme = {
  colors: {
    green: ["", "", "", "", "", "#2f9e44", "#2b8a3e"],
    red: ["", "", "", "", "", "#f03e3e", "#e03131"],
    gray: ["", "", "#e9ecef", "", "", "#868e96", "", "#343a40"],
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
        enabled: true,
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
    });
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
  });
});
