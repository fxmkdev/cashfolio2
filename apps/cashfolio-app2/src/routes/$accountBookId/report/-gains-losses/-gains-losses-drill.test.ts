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

describe("asset-class drill paths", () => {
  test("drills through investment groups to accounts with complete breadcrumbs", () => {
    const group = {
      ...hierarchy[0]!,
      id: "gain-loss-investment:EQUITIES:managed-portfolios",
      label: "Managed Portfolios",
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
      "Managed Portfolios",
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
      label: "Managed Portfolios",
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
    ).toEqual(["All", "Parent", "Renamed Equities", "Managed Portfolios"]);
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
