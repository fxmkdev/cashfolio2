import { _ModuleSupport } from "ag-charts-community";
import { createElement, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { mockColors } from "../../history/-chart-test-helpers";
import { baseOverview } from "../-page-view.story-fixtures";
import {
  type PeriodBreakdownChartOptions,
  usePeriodBreakdownChartOptions,
} from "./-breakdown-chart-options";
import { usePeriodAllocationBreakdownViewModel } from "./-period-allocation-breakdown-view-model";
import { usePeriodBreakdownViewModel } from "./-period-breakdown-view-model";

function renderChartOptions(useOptions: () => PeriodBreakdownChartOptions) {
  let options: PeriodBreakdownChartOptions | undefined;
  function Harness() {
    options = useOptions();
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  if (!options) throw new Error("Expected chart options");
  return options;
}

function getBarSeries(options: PeriodBreakdownChartOptions) {
  const series = options.series ?? [];
  expect(series.length).toBeGreaterThan(1);
  return series.map((item) => {
    if (item.type !== "bar") throw new Error("Expected a bar series");
    return item;
  });
}

function expectCategoryColorsAndLegend(options: PeriodBreakdownChartOptions) {
  expect(options.legend).toMatchObject({ enabled: true, position: "bottom" });
  for (const item of getBarSeries(options)) {
    expect(item.data).toHaveLength(1);
    expect(item).not.toHaveProperty("fill");
    expect(item).not.toHaveProperty("stroke");
    expect(item.showInLegend).toBe(true);
    expect(item.legendItemName).toBeUndefined();
    expect(item.yName).toBe(item.data?.[0].label);
    const renderer = item.tooltip?.renderer;
    if (!renderer) throw new Error("Expected a tooltip renderer");
    expect(
      renderer({ datum: item.data?.[0] } as Parameters<typeof renderer>[0]),
    ).toEqual({
      heading: item.data?.[0].label,
      data: [
        { label: "Amount", value: item.data?.[0].amountLabel },
        { label: "Share", value: item.data?.[0].percentageLabel },
      ],
    });
  }
}

const commonArgs = {
  accountBookId: "test-book",
  overview: baseOverview,
  currencyFormatter: new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "CHF",
  }),
  percentageFormatter: new Intl.NumberFormat("en-CH"),
  colors: mockColors,
  onBreakdownAccountDoubleClick: vi.fn(),
};

describe("report breakdown bar colors and legends", () => {
  const investmentId = "allocation-investment:EQUITIES:SECURITY:AAPL";
  const allocationHierarchy = [
    {
      id: "asset-class:EQUITIES",
      label: "Equities",
      kind: "group" as const,
      amount: 150,
      children: [
        {
          id: investmentId,
          label: "AAPL",
          kind: "group" as const,
          amount: 150,
          children: [
            {
              id: "account:apple-1",
              label: "Apple",
              accountGroupPath: ["Bank", "Brokerage"],
              kind: "account" as const,
              amount: 100,
              children: [],
            },
            {
              id: "account:apple-2",
              label: "Apple",
              accountGroupPath: ["Bank", "Brokerage"],
              kind: "account" as const,
              amount: 50,
              children: [],
            },
          ],
        },
      ],
    },
  ];

  test.each(["asset", "liability"] as const)(
    "%s allocation uses full paths and distinct IDs for equally named accounts",
    (side) => {
      const breakdown = {
        ...baseOverview.accountBreakdownsByGrouping.assetClass.assetBreakdown,
        hierarchy: allocationHierarchy,
      };
      const options = renderChartOptions(
        () =>
          usePeriodAllocationBreakdownViewModel({
            ...commonArgs,
            grouping: "assetClass",
            overview: {
              ...baseOverview,
              accountBreakdownsByGrouping: {
                ...baseOverview.accountBreakdownsByGrouping,
                assetClass: {
                  ...baseOverview.accountBreakdownsByGrouping.assetClass,
                  assetBreakdown: breakdown,
                  liabilityBreakdown: breakdown,
                },
              },
            },
            selectedAllocationBreakdown: side,
            selectedAllocationChartType: "bar",
            drillPathByAllocationBreakdown: {
              asset: ["asset-class:EQUITIES", investmentId],
              liability: ["asset-class:EQUITIES", investmentId],
            },
            setDrillPathByAllocationBreakdown: vi.fn(),
          }).allocationChartOptions,
      );
      const series = getBarSeries(options);
      expect(series.map((item) => item.xKey)).toEqual(["id", "id"]);
      expect(series.map((item) => item.data?.[0].id)).toEqual([
        "account:apple-1",
        "account:apple-2",
      ]);
      expect(series.map((item) => item.yName)).toEqual([
        "Bank / Brokerage / Apple",
        "Bank / Brokerage / Apple",
      ]);
      expectCategoryColorsAndLegend(options);
    },
  );

  test.each(["bar", "donut"] as const)(
    "%s investment groups require a separate account double-click",
    (chartType) => {
      const onOpen = vi.fn();
      const onPath = vi.fn();
      let model:
        ReturnType<typeof usePeriodAllocationBreakdownViewModel> | undefined;
      function Harness() {
        model = usePeriodAllocationBreakdownViewModel({
          ...commonArgs,
          onBreakdownAccountDoubleClick: onOpen,
          grouping: "assetClass",
          overview: {
            ...baseOverview,
            accountBreakdownsByGrouping: {
              ...baseOverview.accountBreakdownsByGrouping,
              assetClass: {
                ...baseOverview.accountBreakdownsByGrouping.assetClass,
                assetBreakdown: {
                  ...baseOverview.accountBreakdownsByGrouping.assetClass
                    .assetBreakdown,
                  hierarchy: allocationHierarchy,
                },
              },
            },
          },
          selectedAllocationBreakdown: "asset",
          selectedAllocationChartType: chartType,
          drillPathByAllocationBreakdown: {
            asset: ["asset-class:EQUITIES"],
            liability: [],
          },
          setDrillPathByAllocationBreakdown: onPath,
        });
        return null;
      }
      renderToStaticMarkup(createElement(Harness));
      if (!model) throw new Error("Missing allocation model");
      const options = model.allocationChartOptions;
      const series = options.series?.[0];
      if (!series || (series.type !== "donut" && series.type !== "bar"))
        throw new Error("Missing chart series");
      const datum =
        series.type === "bar" ? series.data?.[0] : options.data?.[0];
      const listener = series.listeners?.seriesNodeDoubleClick;
      if (!listener) throw new Error("Missing double-click listener");
      const event = new Event("dblclick");
      listener({ datum, event } as Parameters<typeof listener>[0]);
      model.handleAllocationChartContainerDoubleClick?.({
        nativeEvent: event,
      } as MouseEvent<HTMLDivElement>);
      expect(onOpen).not.toHaveBeenCalled();
      expect(onPath).toHaveBeenCalledOnce();
      expect(
        onPath.mock.calls[0][0]({
          asset: ["asset-class:EQUITIES"],
          liability: [],
        }),
      ).toEqual({
        asset: ["asset-class:EQUITIES", investmentId],
        liability: [],
      });
      expect(
        model.allocationDrillState.breadcrumbs.map((crumb) => crumb.label),
      ).toEqual(["All Assets", "Equities"]);
    },
  );

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
    "%s allocation uses the category palette with a bottom legend",
    (selectedAllocationBreakdown) => {
      const options = renderChartOptions(
        () =>
          usePeriodAllocationBreakdownViewModel({
            grouping: "accountStructure",
            ...commonArgs,
            selectedAllocationBreakdown,
            selectedAllocationChartType: "bar",
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
      expectCategoryColorsAndLegend(options);
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

  test.each(["bar", "donut"] as const)(
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
          mockColors.negativeMarkerColor,
          mockColors.zeroLineColor,
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
      const options = renderChartOptions(() =>
        usePeriodBreakdownChartOptions({
          chartData,
          selectedChartType,
          colors: mockColors,
          totalBreakdownAmountLabel: "CHF 150",
          onNodeDoubleClick: vi.fn(),
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
