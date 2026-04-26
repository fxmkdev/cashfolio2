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
  test("maps timeline points to chart datum shape", () => {
    expect(
      mapTimelinePointsToChartData([
        {
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 10,
        },
      ]),
    ).toEqual([
      {
        periodValue: "2026-01",
        periodLabel: "January 2026",
        totalReturn: 10,
      },
    ]);
  });
});

describe("createTimelineChartOptions", () => {
  test("highlights the current period band when data exists", () => {
    const options = createTimelineChartOptions({
      chartData: [
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
      ],
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
        range: ["February 2026", "February 2026"],
        fill: "#e9ecef",
        fillOpacity: 0.45,
        strokeWidth: 0,
      },
    ]);
  });

  test("omits period band highlight when data is empty", () => {
    const options = createTimelineChartOptions({
      chartData: [],
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
