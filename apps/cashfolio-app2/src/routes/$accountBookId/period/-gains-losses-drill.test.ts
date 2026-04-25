import { describe, expect, test } from "vitest";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import {
  clampGainsLossesPath,
  getGainsLossesDrillState,
  isGainsLossesNodeDrillable,
} from "./-gains-losses-drill";

const hierarchy: GainsLossesBreakdownNode[] = [
  {
    id: "unit-type:fx",
    label: "FX",
    realizedGainLoss: 5,
    unrealizedGainLoss: 2,
    totalGainLoss: 7,
    children: [
      {
        id: "unit:fx:USD",
        label: "USD",
        realizedGainLoss: 5,
        unrealizedGainLoss: 2,
        totalGainLoss: 7,
        children: [
          {
            id: "unit-account:fx:USD:account-cash-usd",
            label: "Cash USD",
            realizedGainLoss: 5,
            unrealizedGainLoss: 2,
            totalGainLoss: 7,
            children: [],
          },
        ],
      },
    ],
  },
];

describe("clampGainsLossesPath", () => {
  test("keeps valid unit-type -> unit path", () => {
    expect(
      clampGainsLossesPath({
        hierarchy,
        path: ["unit-type:fx", "unit:fx:USD"],
      }),
    ).toEqual(["unit-type:fx", "unit:fx:USD"]);
  });

  test("drops trailing invalid and non-drillable segments", () => {
    expect(
      clampGainsLossesPath({
        hierarchy,
        path: [
          "unit-type:fx",
          "unit:fx:USD",
          "unit-account:fx:USD:account-cash-usd",
        ],
      }),
    ).toEqual(["unit-type:fx", "unit:fx:USD"]);
    expect(
      clampGainsLossesPath({
        hierarchy,
        path: ["unit-type:fx", "unit:missing"],
      }),
    ).toEqual(["unit-type:fx"]);
  });
});

describe("getGainsLossesDrillState", () => {
  test("returns breadcrumbs and current nodes for current path", () => {
    const state = getGainsLossesDrillState({
      hierarchy,
      path: ["unit-type:fx", "unit:fx:USD"],
      rootLabel: "All Gains/Losses",
    });

    expect(state.breadcrumbs).toEqual([
      { id: null, label: "All Gains/Losses" },
      { id: "unit-type:fx", label: "FX" },
      { id: "unit:fx:USD", label: "USD" },
    ]);
    expect(state.currentNodes).toEqual([
      {
        id: "unit-account:fx:USD:account-cash-usd",
        label: "Cash USD",
        realizedGainLoss: 5,
        unrealizedGainLoss: 2,
        totalGainLoss: 7,
        children: [],
      },
    ]);
  });
});

describe("isGainsLossesNodeDrillable", () => {
  test("only treats nodes with children as drillable", () => {
    expect(isGainsLossesNodeDrillable(hierarchy[0]!)).toBe(true);
    expect(
      isGainsLossesNodeDrillable(hierarchy[0]!.children[0]!.children[0]!),
    ).toBe(false);
  });
});
