import { describe, expect, test } from "vitest";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import { hasExplicitGainLossGroup } from "./-gains-losses-explicit";

describe("hasExplicitGainLossGroup", () => {
  test("returns true when hierarchy includes top-level explicit group", () => {
    const hierarchy: GainsLossesBreakdownNode[] = [
      {
        id: "unit-type:explicit",
        label: "Explicit G/L",
        realizedGainLoss: 10,
        unrealizedGainLoss: 0,
        totalGainLoss: 10,
        children: [],
      },
    ];

    expect(hasExplicitGainLossGroup(hierarchy)).toBe(true);
  });

  test("returns false when hierarchy has no explicit group", () => {
    const hierarchy: GainsLossesBreakdownNode[] = [
      {
        id: "unit-type:fx",
        label: "FX",
        realizedGainLoss: 5,
        unrealizedGainLoss: 2,
        totalGainLoss: 7,
        children: [],
      },
    ];

    expect(hasExplicitGainLossGroup(hierarchy)).toBe(false);
  });
});
