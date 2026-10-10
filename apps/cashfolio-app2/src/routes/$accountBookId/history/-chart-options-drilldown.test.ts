import { describe, expect, test, vi } from "vitest";
import {
  createHistoryChartOptions,
  mapHistoryPointsToChartData,
} from "./-chart-options";
import {
  createHistoryPoint,
  mockColors,
  mockTheme,
} from "./-chart-test-helpers";

describe("History chart drill-down", () => {
  const chartData = mapHistoryPointsToChartData([
    createHistoryPoint({
      periodValue: "2026-01",
      periodLabel: "January 2026",
      totalReturn: 10,
      savings: 7,
      income: 11,
      expenses: 4,
      gainsLosses: 3,
    }),
  ]);

  function createOptions(
    selectedMetric: "expenses" | "assets" | "liabilities" | "netWorth",
    onPeriodDoubleClick?: (periodValue: string) => void,
  ) {
    return createHistoryChartOptions({
      chartData,
      periodMode: "month",
      selectedMetric,
      onPeriodDoubleClick,
      amountCompactFormatter: new Intl.NumberFormat("en-CH"),
      currencyFormatter: new Intl.NumberFormat("en-CH"),
      colors: mockColors,
      theme: mockTheme,
      isDarkMode: false,
    });
  }

  type Series = {
    marker?: { enabled?: boolean };
    listeners?: { seriesNodeDoubleClick: (event: { datum: unknown }) => void };
  };
  const series = (options: ReturnType<typeof createOptions>) =>
    options.series as Series[];

  test.each(["expenses", "assets", "liabilities"] as const)(
    "opens the exact period from the %s primary series",
    (metric) => {
      const onPeriodDoubleClick = vi.fn();
      const primary = series(createOptions(metric, onPeriodDoubleClick))[0];
      primary.listeners?.seriesNodeDoubleClick({ datum: chartData[0] });
      primary.listeners?.seriesNodeDoubleClick({
        datum: { ...chartData[0], periodValue: "2026" },
      });
      expect(onPeriodDoubleClick.mock.calls).toEqual([["2026-01"], ["2026"]]);
      if (metric !== "expenses")
        expect(primary.marker).toMatchObject({ enabled: true, size: 5 });
    },
  );

  test("rejects the synthetic opening-balance point", () => {
    const onPeriodDoubleClick = vi.fn();
    series(
      createOptions("assets", onPeriodDoubleClick),
    )[0].listeners?.seriesNodeDoubleClick({
      datum: { ...chartData[0], periodValue: "opening-balance:2025-12-31" },
    });
    expect(onPeriodDoubleClick).not.toHaveBeenCalled();
  });

  test("does not wire aggregate overlays or Net Worth", () => {
    const onPeriodDoubleClick = vi.fn();
    for (const overlay of series(
      createOptions("expenses", onPeriodDoubleClick),
    ).slice(1))
      expect(overlay.listeners).toBeUndefined();
    for (const area of series(createOptions("netWorth", onPeriodDoubleClick)))
      expect(area.listeners).toBeUndefined();
  });

  test("omits events and balance markers when no destination is available", () => {
    expect(series(createOptions("expenses"))[0].listeners).toBeUndefined();
    expect(series(createOptions("assets"))[0]).toMatchObject({
      marker: { enabled: false },
      listeners: undefined,
    });
  });
});
