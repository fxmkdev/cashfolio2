import { createElement } from "react";
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
    expect(item.legendItemName).toBe(item.data?.[0].label);
    expect(item.yName).toBe("Amount");
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
    expect(
      getBarSeries(options).map((series) => series.legendItemName),
    ).toEqual(["Rent", "Utilities"]);
  });

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
