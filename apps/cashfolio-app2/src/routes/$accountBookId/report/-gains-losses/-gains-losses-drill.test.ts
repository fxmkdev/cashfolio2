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
