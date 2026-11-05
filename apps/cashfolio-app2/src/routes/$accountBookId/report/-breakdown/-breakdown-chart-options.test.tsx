import { _ModuleSupport } from "ag-charts-community";
import { describe, expect, test, vi } from "vitest";
import { mockColors } from "../../history/-chart-test-helpers";
import { baseOverview } from "../-page-view.story-fixtures";
import { usePeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import { useAllocationChartOptions } from "./-allocation-chart-options";
import { usePeriodAllocationBreakdownViewModel } from "./-period-allocation-breakdown-view-model";
import { usePeriodBreakdownViewModel } from "./-period-breakdown-view-model";

import {
  commonArgs,
  renderChartOptions,
  getBarSeries,
  expectCategoryColorsAndLegend,
} from "./-breakdown-chart-test-helpers";

describe("report breakdown bar colors and legends", () => {
  test.each(["expense", "income"] as const)(
    "%s uses the category palette with a bottom legend",
    (selectedBreakdown) => {
      const options = renderChartOptions(
        () =>
          usePeriodBreakdownViewModel({
            ...commonArgs,
            selectedBreakdown,
            selectedChartType: "bar",
            drillPathByBreakdown: { expense: [], income: [], cashFlow: [] },
            setDrillPathByBreakdown: vi.fn(),
          }).chartOptions,
      );
      expectCategoryColorsAndLegend(options);
    },
  );

  test.each(["asset", "liability"] as const)(
    "%s allocation uses a donut with a bottom legend",
    (selectedAllocationBreakdown) => {
      const options = renderChartOptions(
        () =>
          usePeriodAllocationBreakdownViewModel({
            grouping: "accountStructure",
            ...commonArgs,
            selectedAllocationBreakdown,
            selectedAllocationChartType: "donut",
            drillPathByAllocationBreakdown: {
              asset: [],
              liability:
                selectedAllocationBreakdown === "liability"
                  ? ["group:debt"]
                  : [],
            },
            setDrillPathByAllocationBreakdown: vi.fn(),
          }).allocationChartOptions,
      );
      expect(options.series?.[0]?.type).toBe("donut");
      expect(options.legend).toMatchObject({ position: "bottom" });
    },
  );

  test("drilled-down expense legends name the visible child categories", () => {
    const options = renderChartOptions(
      () =>
        usePeriodBreakdownViewModel({
          ...commonArgs,
          selectedBreakdown: "expense",
          selectedChartType: "bar",
          drillPathByBreakdown: {
            expense: ["group:housing"],
            income: [],
            cashFlow: [],
          },
          setDrillPathByBreakdown: vi.fn(),
        }).chartOptions,
    );
    expectCategoryColorsAndLegend(options);
    expect(getBarSeries(options).map((series) => series.yName)).toEqual([
      "Rent",
      "Utilities",
    ]);
  });

  test.each([0, 1])(
    "legend interactions target only category %i when a group and account share a name",
    (selectedIndex) => {
      const options = renderChartOptions(
        () =>
          usePeriodBreakdownViewModel({
            ...commonArgs,
            overview: {
              ...baseOverview,
              expenseBreakdown: {
                ...baseOverview.expenseBreakdown,
                hierarchy: [
                  {
                    id: "group:investments",
                    label: "Investments",
                    kind: "group",
                    amount: 100,
                    children: [
                      {
                        id: "account:fund-fees",
                        label: "Fund Fees",
                        kind: "account",
                        amount: 100,
                        children: [],
                      },
                    ],
                  },
                  {
                    id: "account:investments",
                    label: "Investments",
                    kind: "account",
                    amount: 50,
                    children: [],
                  },
                ],
              },
            },
            selectedBreakdown: "expense",
            selectedChartType: "bar",
            drillPathByBreakdown: { expense: [], income: [], cashFlow: [] },
            setDrillPathByBreakdown: vi.fn(),
          }).chartOptions,
      );
      const series = getBarSeries(options).map((properties, index) => ({
        id: `series-${index}`,
        properties,
        toggleSeriesItem: vi.fn(),
      }));
      const selectedSeries = series[selectedIndex];
      const otherSeries = series[1 - selectedIndex];
      const event = {
        legendType: "category" as const,
        enabled: false,
        series: selectedSeries,
        itemId: "amount",
        legendItemName: selectedSeries.properties.legendItemName,
      };
      // Exercise the installed AG Charts handlers; shared legendItemName values
      // link otherwise independent series even when their IDs differ.
      for (const item of series) {
        _ModuleSupport.Series.prototype.onLegendItemClick.call(
          item as unknown as _ModuleSupport.UnknownSeries,
          event,
        );
      }
      expect(selectedSeries.toggleSeriesItem).toHaveBeenCalledOnce();
      expect(otherSeries.toggleSeriesItem).not.toHaveBeenCalled();

      for (const item of series) {
        item.toggleSeriesItem.mockClear();
        _ModuleSupport.Series.prototype.onLegendItemDoubleClick.call(
          item as unknown as _ModuleSupport.UnknownSeries,
          { ...event, enabled: true, numVisibleItems: 2 },
        );
      }
      expect(selectedSeries.toggleSeriesItem.mock.calls[0]?.[0]).toBe(true);
      expect(otherSeries.toggleSeriesItem.mock.calls[0]?.[0]).toBe(false);
      expectCategoryColorsAndLegend(options);
      expect(series.map((item) => item.properties.yName)).toEqual([
        "Investments",
        "Investments",
      ]);
    },
  );

  test.each(["bar", "table"] as const)(
    "cash flow uses sign colors when the stored chart type is %s",
    (selectedChartType) => {
      const options = renderChartOptions(
        () =>
          usePeriodBreakdownViewModel({
            ...commonArgs,
            overview: {
              ...baseOverview,
              cashFlowBreakdown: {
                ...baseOverview.cashFlowBreakdown,
                hierarchy: [100, -50, 0].map((amount, index) => ({
                  id: `account:cash-${index}`,
                  label: `Cash ${index}`,
                  kind: "account",
                  amount,
                  children: [],
                })),
              },
            },
            selectedBreakdown: "cashFlow",
            selectedChartType,
            drillPathByBreakdown: { expense: [], income: [], cashFlow: [] },
            setDrillPathByBreakdown: vi.fn(),
          }).chartOptions,
      );
      const series = getBarSeries(options);
      expect(series).toHaveLength(3);
      expect(options.legend).toMatchObject({ enabled: false });
      for (const item of series) {
        expect(item.showInLegend).toBe(false);
      }
      expect(series.map(({ fill, stroke }) => ({ fill, stroke }))).toEqual(
        [
          mockColors.positiveMarkerColor,
          mockColors.zeroLineColor,
          mockColors.negativeMarkerColor,
        ].map((color) => ({ fill: color, stroke: color })),
      );
    },
  );

  test.each(["bar", "donut"] as const)(
    "the shared hook defaults to automatic colors and a bottom legend for %s",
    (selectedChartType) => {
      const chartData = [100, 50].map((amount, index) => ({
        id: `account:${index}`,
        label: `Category ${index}`,
        kind: "account" as const,
        amount,
        percentage: 0,
        isDrillable: false,
        amountLabel: String(amount),
        percentageLabel: "0%",
      }));
      const args = {
        chartData,
        colors: mockColors,
        onNodeDoubleClick: vi.fn(),
      };
      const options =
        selectedChartType === "bar"
          ? renderChartOptions(() => usePeriodBreakdownChartOptions(args))
          : renderChartOptions(() =>
              useAllocationChartOptions({
                ...args,
                totalAmountLabel: "CHF 150",
              }),
            );
      if (selectedChartType === "bar") {
        expectCategoryColorsAndLegend(options);
      } else {
        expect(options.legend).toMatchObject({ position: "bottom" });
        expect(options.legend?.enabled).not.toBe(false);
        expect(options.data).toEqual(chartData);
        expect(options.series).toHaveLength(1);
        expect(options.series?.[0]).toMatchObject({ type: "donut" });
        expect(options.series?.[0]).not.toHaveProperty("fills");
        expect(options.series?.[0]).not.toHaveProperty("strokes");
      }
    },
  );
});

test("horizontal bars rank amounts, allow scrolling, and retain full-name tooltips", () => {
  const chartData = Array.from({ length: 20 }, (_, i) => ({
    id: `account:${i}`,
    label: `Long Category / Account ${i}`,
    kind: "account" as const,
    amount: i - 5,
    percentage: i,
    isDrillable: false,
    amountLabel: `CHF ${i - 5}`,
    percentageLabel: `${i}%`,
  }));
  const onOpen = vi.fn();
  const options = renderChartOptions(() =>
    usePeriodBreakdownChartOptions({
      chartData,
      colorBySign: true,
      colors: mockColors,
      onNodeDoubleClick: onOpen,
    }),
  );
  const series = getBarSeries(options);
  expect(series.every((item) => item.direction === "horizontal")).toBe(true);
  expect(series.map((item) => item.data?.[0]?.amount)).toEqual(
    [...chartData].reverse().map((item) => item.amount),
  );
  expect(options.height).toBeGreaterThan(440);
  expect(options).toMatchObject({
    axes: {
      y: { type: "category", reverse: true },
      x: { type: "number", crossLines: [{ value: 0 }] },
    },
  });
  const first = series[0];
  const renderer = first.tooltip!.renderer!;
  expect(
    renderer({ datum: first.data![0] } as Parameters<typeof renderer>[0]),
  ).toEqual({
    heading: "Long Category / Account 19",
    data: [
      { label: "Amount", value: "CHF 14" },
      { label: "Share of Absolute Movement", value: "19%" },
    ],
  });
  const listener = first.listeners!.seriesNodeDoubleClick!;
  const event = new Event("dblclick");
  listener({ datum: first.data![0], event } as Parameters<typeof listener>[0]);
  expect(onOpen).toHaveBeenCalledWith(first.data![0], event);
});
