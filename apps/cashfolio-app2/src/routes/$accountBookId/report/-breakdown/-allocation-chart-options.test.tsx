import { createElement, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { baseOverview } from "../-page-view.story-fixtures";
import { usePeriodAllocationBreakdownViewModel } from "./-period-allocation-breakdown-view-model";
import {
  commonArgs,
  renderChartOptions,
  getBarSeries,
  expectCategoryColorsAndLegend,
} from "./-breakdown-chart-test-helpers";

describe("allocation investment charts", () => {
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
});
