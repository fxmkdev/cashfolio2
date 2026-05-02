import type { MantineTheme } from "@mantine/core";
import { describe, expect, test } from "vitest";
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
  prependOpeningBalanceChartDatum,
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

function createTimelinePoint(args: {
  periodValue: string;
  periodLabel: string;
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets?: number;
  liabilities?: number;
  netWorth?: number;
}) {
  return {
    ...args,
    assets: args.assets ?? 100,
    liabilities: args.liabilities ?? 40,
    netWorth: args.netWorth ?? (args.assets ?? 100) - (args.liabilities ?? 40),
  };
}

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
});

describe("createTimelineChartOptions", () => {
  test("uses bar + cumulative line for non-cumulative metrics", () => {
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
    expect(options.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "bar",
          yKey: "savings",
          yName: "Savings",
        }),
        expect.objectContaining({
          type: "line",
          yKey: "cumulativeMetric",
          yName: "Cumulative Savings",
        }),
      ]),
    );
  });

  test("uses yearly range buttons in year mode", () => {
    const options = createTimelineChartOptions({
      chartData: mapTimelinePointsToChartData([
        createTimelinePoint({
          periodValue: "2025",
          periodLabel: "2025",
          totalReturn: 1,
          savings: 1,
          income: 1,
          expenses: 0,
          gainsLosses: 0,
        }),
      ]),
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
  });

  test("renders assets as green area without cumulative line", () => {
    const options = createTimelineChartOptions({
      chartData: mapTimelinePointsToChartData([
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
    expect(series).toHaveLength(1);
    expect(options.axes?.x).toMatchObject({
      type: "time",
    });
    expect(series[0]).toMatchObject({
      type: "area",
      yKey: "assets",
      yName: "Assets",
      stroke: "#2b8a3e",
      fill: "#2b8a3e",
    });
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

  test("keeps cumulative line visible by including it in y-domain for bar metrics", () => {
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

    expect(options.axes?.y).toMatchObject({ min: 0, max: 250 });
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
