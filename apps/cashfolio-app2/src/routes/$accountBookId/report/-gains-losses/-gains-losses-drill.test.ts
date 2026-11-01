import { describe, expect, test } from "vitest";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import {
  clampGainsLossesPath,
  getGainsLossesDrillState,
  isGainsLossesNodeDrillable,
} from "./-gains-losses-drill";

const hierarchy: GainsLossesBreakdownNode[] = [
  {
    id: "asset-class:EQUITIES",
    label: "Equities",
    realizedGainLoss: 5,
    unrealizedGainLoss: 2,
    totalGainLoss: 7,
    children: [
      {
        id: "gain-loss-account:portfolio",
        label: "Portfolio",
        realizedGainLoss: 5,
        unrealizedGainLoss: 2,
        totalGainLoss: 7,
        children: [],
      },
    ],
  },
];

function investment(symbol: string): GainsLossesBreakdownNode {
  return {
    ...hierarchy[0]!,
    id: `gain-loss-investment:EQUITIES:SECURITY:${symbol}`,
    label: symbol,
    children: [
      {
        ...hierarchy[0]!.children[0]!,
        id: `gain-loss-account:${symbol}`,
        label: `${symbol} Account`,
      },
    ],
  };
}

describe("asset-class drill paths", () => {
  test("retains Equities when the selected AAPL investment disappears in the next period", () => {
    const aapl = investment("AAPL"),
      msft = investment("MSFT");
    const previous = [
      {
        ...hierarchy[0]!,
        realizedGainLoss: 10,
        unrealizedGainLoss: 4,
        totalGainLoss: 14,
        children: [aapl, msft],
      },
    ];
    const next = [{ ...hierarchy[0]!, children: [msft] }];
    const path = ["asset-class:EQUITIES", aapl.id];
    expect(clampGainsLossesPath({ hierarchy: previous, path })).toEqual(path);
    expect(clampGainsLossesPath({ hierarchy: next, path })).toEqual([
      "asset-class:EQUITIES",
    ]);
    const state = getGainsLossesDrillState({
      hierarchy: next,
      path,
      rootLabel: "All Gains/Losses",
    });
    expect(state.breadcrumbs.map((crumb) => crumb.label)).toEqual([
      "All Gains/Losses",
      "Equities",
    ]);
    expect(state.currentNodes).toEqual([msft]);
  });
  test("falls back through a missing subclass and investment to their surviving class", () => {
    const path = [
      "asset-class:EQUITIES",
      "asset-class:domestic",
      "gain-loss-investment:domestic:SECURITY:AAPL",
    ];
    expect(clampGainsLossesPath({ hierarchy, path })).toEqual([
      "asset-class:EQUITIES",
    ]);
  });
  test("reconstructs the current path of a relocated surviving ancestor", () => {
    const moved = [
      {
        ...hierarchy[0]!,
        id: "asset-class:parent",
        label: "Parent",
        children: hierarchy,
      },
    ];
    const path = [
      "asset-class:EQUITIES",
      "asset-class:missing",
      "gain-loss-investment:missing:SECURITY:AAPL",
    ];
    expect(clampGainsLossesPath({ hierarchy: moved, path })).toEqual([
      "asset-class:parent",
      "asset-class:EQUITIES",
    ]);
  });
  test("retains the deepest surviving nested class", () => {
    const nested = [
      {
        ...hierarchy[0]!,
        children: [
          { ...hierarchy[0]!, id: "asset-class:domestic", label: "Domestic" },
        ],
      },
    ];
    const path = [
      "asset-class:EQUITIES",
      "asset-class:domestic",
      "gain-loss-investment:domestic:SECURITY:AAPL",
    ];
    expect(clampGainsLossesPath({ hierarchy: nested, path })).toEqual(
      path.slice(0, 2),
    );
    expect(clampGainsLossesPath({ hierarchy: [], path })).toEqual([]);
  });
  test("drills through investment groups to accounts with complete breadcrumbs", () => {
    const group = {
      ...hierarchy[0]!,
      id: "gain-loss-investment:EQUITIES:managed-portfolios",
      label: "Total Value Accounts",
    };
    const nested = [{ ...hierarchy[0]!, children: [group] }];
    const path = [nested[0]!.id, group.id];
    expect(
      clampGainsLossesPath({
        hierarchy: nested,
        path: [...path, "gain-loss-account:portfolio"],
      }),
    ).toEqual(path);
    const state = getGainsLossesDrillState({
      hierarchy: nested,
      path,
      rootLabel: "All Gains/Losses",
    });
    expect(state.breadcrumbs.map((crumb) => crumb.label)).toEqual([
      "All Gains/Losses",
      "Equities",
      "Total Value Accounts",
    ]);
    expect(state.currentNodes).toEqual(hierarchy[0]!.children);
  });

  test("preserves a selected class when it moves under a new parent", () => {
    const moved = [
      {
        ...hierarchy[0]!,
        id: "asset-class:parent",
        label: "Parent",
        children: hierarchy,
      },
    ];
    expect(
      clampGainsLossesPath({
        hierarchy: moved,
        path: ["asset-class:EQUITIES"],
      }),
    ).toEqual(["asset-class:parent", "asset-class:EQUITIES"]);
    expect(
      getGainsLossesDrillState({
        hierarchy: moved,
        path: ["asset-class:EQUITIES"],
        rootLabel: "All",
      }).currentNodes,
    ).toEqual(hierarchy[0]!.children);
  });
  test("preserves an investment selection across a class rename and reparent", () => {
    const investment = {
      ...hierarchy[0]!,
      id: "gain-loss-investment:EQUITIES:managed-portfolios",
      label: "Total Value Accounts",
    };
    const moved = [
      {
        ...hierarchy[0]!,
        id: "asset-class:parent",
        label: "Parent",
        children: [
          {
            ...hierarchy[0]!,
            label: "Renamed Equities",
            children: [investment],
          },
        ],
      },
    ];
    const previousPath = ["asset-class:EQUITIES", investment.id];
    expect(
      clampGainsLossesPath({ hierarchy: moved, path: previousPath }),
    ).toEqual(["asset-class:parent", ...previousPath]);
    expect(
      getGainsLossesDrillState({
        hierarchy: moved,
        path: previousPath,
        rootLabel: "All",
      }).breadcrumbs.map((crumb) => crumb.label),
    ).toEqual(["All", "Parent", "Renamed Equities", "Total Value Accounts"]);
    expect(clampGainsLossesPath({ hierarchy: [], path: previousPath })).toEqual(
      [],
    );
  });
  test("retains classes and drops non-drillable account segments", () => {
    expect(
      clampGainsLossesPath({
        hierarchy,
        path: ["asset-class:EQUITIES", "gain-loss-account:portfolio"],
      }),
    ).toEqual(["asset-class:EQUITIES"]);
    expect(isGainsLossesNodeDrillable(hierarchy[0]!)).toBe(true);
    expect(isGainsLossesNodeDrillable(hierarchy[0]!.children[0]!)).toBe(false);
  });
  test("clamps obsolete valuation-type paths and removed classes", () => {
    for (const path of [
      ["unit-type:fx", "unit:fx:USD"],
      ["unit-type:explicit"],
      ["asset-class:OTHER_ASSETS"],
    ]) {
      expect(clampGainsLossesPath({ hierarchy, path })).toEqual([]);
    }
  });
  test("returns class breadcrumbs and account leaves", () => {
    const state = getGainsLossesDrillState({
      hierarchy,
      path: ["asset-class:EQUITIES"],
      rootLabel: "All Gains/Losses",
    });
    expect(state.breadcrumbs).toEqual([
      { id: null, label: "All Gains/Losses" },
      { id: "asset-class:EQUITIES", label: "Equities" },
    ]);
    expect(state.currentNodes).toEqual(hierarchy[0]!.children);
  });
});
