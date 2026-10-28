import { describe, expect, test } from "vitest";
import {
  createHistoryChartOptions,
  mapHistoryPointsToChartData,
} from "./-chart-options";
import {
  createHistoryPoint,
  mockColors,
  mockTheme,
} from "./-chart-test-helpers";

describe("createHistoryChartOptions (balance metrics)", () => {
  test.each([-40, 0, 20])(
    "uses the selected account name and signed balance %s in Net Worth tooltips",
    (balance) => {
      const chartData = mapHistoryPointsToChartData([
        createHistoryPoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          netWorth: balance,
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
        }),
      ]);
      const options = createHistoryChartOptions({
        chartData,
        periodMode: "month",
        selectedMetric: "netWorth",
        selectedMetricSeriesLabel: "Checking",
        amountCompactFormatter: new Intl.NumberFormat("en-CH"),
        currencyFormatter: new Intl.NumberFormat("en-CH"),
        colors: mockColors,
        theme: mockTheme,
        isDarkMode: false,
      });
      for (const series of options.series ?? []) {
        expect(series).toMatchObject({
          yName: "Checking",
          marker: { enabled: false },
        });
        const area = series as unknown as {
          tooltip: { renderer: (args: { datum: unknown }) => unknown };
        };
        expect(area.tooltip.renderer({ datum: chartData[0] })).toMatchObject({
          data: [{ label: "Checking", value: String(balance) }],
        });
      }
    },
  );

  test("renders assets as green area without cumulative line", () => {
    const chartData = mapHistoryPointsToChartData([
      createHistoryPoint({
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
    const options = createHistoryChartOptions({
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
    const options = createHistoryChartOptions({
      chartData: mapHistoryPointsToChartData([
        createHistoryPoint({
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

  test("renders net worth as one continuous area styled above and below zero", () => {
    const options = createHistoryChartOptions({
      chartData: mapHistoryPointsToChartData([
        createHistoryPoint({
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
        createHistoryPoint({
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
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      type: "area",
      yKey: "netWorth",
      segmentation: {
        key: "y",
        segments: [
          { stop: 0, fill: "#e03131", stroke: "#e03131" },
          { start: 0, fill: "#2b8a3e", stroke: "#2b8a3e" },
        ],
      },
    });
  });

  test.each([
    [0, -110, 0, -110, 0],
    [-40, -30, -70, -10, -20],
    [0, 0, 0, 0, 0],
    [20, -30, 0, 40, -10],
  ])("keeps every signed balance in one series: %j", (...balances) => {
    const chartData = mapHistoryPointsToChartData(
      balances.map((netWorth, index) =>
        createHistoryPoint({
          periodValue: `2026-0${index + 1}`,
          periodLabel: `Month ${index + 1}`,
          netWorth,
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
        }),
      ),
    );
    const options = createHistoryChartOptions({
      chartData,
      periodMode: "month",
      selectedMetric: "netWorth",
      amountCompactFormatter: new Intl.NumberFormat("en-CH"),
      currencyFormatter: new Intl.NumberFormat("en-CH"),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: false,
    });
    expect(options.series).toHaveLength(1);
    expect(options.series![0]).toMatchObject({ yKey: "netWorth" });
    expect(options.data?.map((point) => point.netWorth)).toEqual(balances);
    const area = options.series![0] as unknown as {
      marker: {
        itemStyler: (params: { datum: unknown }) => {
          fill: string;
          stroke: string;
        };
      };
    };
    for (const datum of chartData) {
      const color = datum.netWorth < 0 ? "#e03131" : "#2b8a3e";
      expect(area.marker.itemStyler({ datum })).toEqual({
        fill: color,
        stroke: color,
      });
    }
  });

  test.each(["assets", "liabilities", "netWorth"] as const)(
    "hides the %s legend",
    (selectedMetric) => {
      const options = createHistoryChartOptions({
        chartData: [],
        periodMode: "month",
        selectedMetric,
        amountCompactFormatter: new Intl.NumberFormat("en-CH"),
        currencyFormatter: new Intl.NumberFormat("en-CH"),
        colors: mockColors,
        theme: mockTheme,
        isDarkMode: false,
      });
      expect(options.legend).toEqual({ enabled: false });
    },
  );

  test("forces y-axis to include zero for positive-only metrics", () => {
    const options = createHistoryChartOptions({
      chartData: mapHistoryPointsToChartData([
        createHistoryPoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          liabilities: 30,
        }),
        createHistoryPoint({
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
    const options = createHistoryChartOptions({
      chartData: mapHistoryPointsToChartData([
        createHistoryPoint({
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 0,
          savings: 0,
          income: 0,
          expenses: 0,
          gainsLosses: 0,
          netWorth: -20,
        }),
        createHistoryPoint({
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
