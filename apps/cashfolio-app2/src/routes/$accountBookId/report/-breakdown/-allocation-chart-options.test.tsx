import { createElement, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { baseOverview } from "../-page-view.story-fixtures";
import { usePeriodAllocationBreakdownViewModel } from "./-period-allocation-breakdown-view-model";
import {
  commonArgs,
  renderChartOptions,
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
            selectedAllocationChartType: "donut",
            drillPathByAllocationBreakdown: {
              asset: ["asset-class:EQUITIES", investmentId],
              liability: ["asset-class:EQUITIES", investmentId],
            },
            setDrillPathByAllocationBreakdown: vi.fn(),
          }).allocationChartOptions,
      );
      expect(options.data?.map((item) => item.id)).toEqual([
        "account:apple-1",
        "account:apple-2",
      ]);
      expect(options.data?.map((item) => item.label)).toEqual([
        "Bank / Brokerage / Apple",
        "Bank / Brokerage / Apple",
      ]);
      expect(options.series?.[0]?.type).toBe("donut");
    },
  );

  test.each(["donut", "table"] as const)(
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
      if (!series || series.type !== "donut")
        throw new Error("Missing chart series");
      const datum = options.data?.[0];
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

test.each(["asset", "liability"] as const)(
  "simplifies nested %s allocations without changing hierarchy or totals",
  (side) => {
    const children = Array.from({ length: 6 }, (_, i) => ({
      id: `account:${i}`,
      label: `Account ${i}`,
      kind: "account" as const,
      amount: i + 1,
      children: [],
    }));
    const hierarchy = [
      {
        id: "group:many",
        label: "Many Accounts",
        kind: "group" as const,
        amount: 21,
        children,
      },
    ];
    const breakdown = {
      ...baseOverview.accountBreakdownsByGrouping.accountStructure
        .assetBreakdown,
      hierarchy,
      totalAmount: 21,
    };
    let model:
      ReturnType<typeof usePeriodAllocationBreakdownViewModel> | undefined;
    function Harness() {
      model = usePeriodAllocationBreakdownViewModel({
        ...commonArgs,
        grouping: "accountStructure",
        selectedAllocationBreakdown: side,
        selectedAllocationChartType: "donut",
        overview: {
          ...baseOverview,
          accountBreakdownsByGrouping: {
            ...baseOverview.accountBreakdownsByGrouping,
            accountStructure: {
              ...baseOverview.accountBreakdownsByGrouping.accountStructure,
              assetBreakdown: breakdown,
              liabilityBreakdown: breakdown,
            },
          },
        },
        drillPathByAllocationBreakdown: {
          asset: ["group:many"],
          liability: ["group:many"],
        },
        setDrillPathByAllocationBreakdown: vi.fn(),
      });
      return null;
    }
    renderToStaticMarkup(createElement(Harness));
    if (!model) throw new Error("Missing allocation model");
    expect(model.allocationChartOptions.data).toHaveLength(5);
    expect(model.otherRows.map((row) => row.id)).toEqual([
      "account:1",
      "account:0",
    ]);
    expect(model.otherSubtotal?.amount).toBe(3);
    expect(model.otherSubtotal?.percentage).toBeCloseTo((3 / 21) * 100);
    expect(model.activeAllocationBreakdown.hierarchy).toEqual(hierarchy);
    expect(model.allocationDrillState.clampedPath).toEqual(["group:many"]);
  },
);
