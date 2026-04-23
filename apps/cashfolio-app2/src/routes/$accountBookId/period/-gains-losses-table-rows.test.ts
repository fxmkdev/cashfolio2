import { describe, expect, test } from "vitest";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import {
  flattenGainsLossesHierarchyRows,
  sumTopLevelRealizedGainLoss,
  sumTopLevelTotalGainLoss,
  sumTopLevelUnrealizedGainLoss,
} from "./-gains-losses-table-rows";

describe("flattenGainsLossesHierarchyRows", () => {
  test("flattens unit-type and unit rows with parent-child ids", () => {
    const hierarchy: GainsLossesBreakdownNode[] = [
      {
        id: "unit-type:fx",
        label: "FX",
        realizedGainLoss: 8,
        unrealizedGainLoss: -1,
        totalGainLoss: 7,
        children: [
          {
            id: "unit:fx:USD",
            label: "USD",
            realizedGainLoss: 8,
            unrealizedGainLoss: -1,
            totalGainLoss: 7,
            children: [],
          },
        ],
      },
      {
        id: "unit-type:security",
        label: "Security",
        realizedGainLoss: 20,
        unrealizedGainLoss: -30,
        totalGainLoss: -10,
        children: [
          {
            id: "unit:security:AAPL:USD",
            label: "AAPL (USD)",
            realizedGainLoss: 20,
            unrealizedGainLoss: -30,
            totalGainLoss: -10,
            children: [],
          },
        ],
      },
    ];

    expect(flattenGainsLossesHierarchyRows(hierarchy)).toEqual([
      {
        id: "unit-type:fx",
        parentId: undefined,
        name: "FX",
        realizedGainLoss: 8,
        unrealizedGainLoss: -1,
        totalGainLoss: 7,
      },
      {
        id: "unit:fx:USD",
        parentId: "unit-type:fx",
        name: "USD",
        realizedGainLoss: 8,
        unrealizedGainLoss: -1,
        totalGainLoss: 7,
      },
      {
        id: "unit-type:security",
        parentId: undefined,
        name: "Security",
        realizedGainLoss: 20,
        unrealizedGainLoss: -30,
        totalGainLoss: -10,
      },
      {
        id: "unit:security:AAPL:USD",
        parentId: "unit-type:security",
        name: "AAPL (USD)",
        realizedGainLoss: 20,
        unrealizedGainLoss: -30,
        totalGainLoss: -10,
      },
    ]);
  });

  test("returns empty array for empty hierarchy", () => {
    expect(flattenGainsLossesHierarchyRows([])).toEqual([]);
  });
});

describe("top-level gains/losses sums", () => {
  test("sums only top-level values", () => {
    const hierarchy: GainsLossesBreakdownNode[] = [
      {
        id: "unit-type:fx",
        label: "FX",
        realizedGainLoss: 8,
        unrealizedGainLoss: -1,
        totalGainLoss: 7,
        children: [
          {
            id: "unit:fx:USD",
            label: "USD",
            realizedGainLoss: 8,
            unrealizedGainLoss: -1,
            totalGainLoss: 7,
            children: [],
          },
        ],
      },
      {
        id: "unit-type:security",
        label: "Security",
        realizedGainLoss: 20,
        unrealizedGainLoss: -30,
        totalGainLoss: -10,
        children: [],
      },
    ];

    expect(sumTopLevelRealizedGainLoss(hierarchy)).toBe(28);
    expect(sumTopLevelUnrealizedGainLoss(hierarchy)).toBe(-31);
    expect(sumTopLevelTotalGainLoss(hierarchy)).toBe(-3);
  });

  test("returns zero for empty hierarchy", () => {
    expect(sumTopLevelRealizedGainLoss([])).toBe(0);
    expect(sumTopLevelUnrealizedGainLoss([])).toBe(0);
    expect(sumTopLevelTotalGainLoss([])).toBe(0);
  });
});
