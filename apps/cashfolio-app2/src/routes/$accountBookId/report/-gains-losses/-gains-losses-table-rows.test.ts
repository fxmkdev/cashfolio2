import { describe, expect, test } from "vitest";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import {
  flattenGainsLossesHierarchyRows,
  sumTopLevelRealizedGainLoss,
  sumTopLevelTotalGainLoss,
  sumTopLevelUnrealizedGainLoss,
} from "./-gains-losses-table-rows";

const hierarchy: GainsLossesBreakdownNode[] = [
  {
    id: "asset-class:EQUITIES",
    label: "Equities",
    realizedGainLoss: 8,
    unrealizedGainLoss: -1,
    totalGainLoss: 7,
    children: [
      {
        // Navigation depends on metadata even if the row ID does not encode an account.
        id: "opaque-row",
        label: "USD Equity Portfolio",
        realizedGainLoss: 8,
        unrealizedGainLoss: -1,
        totalGainLoss: 7,
        children: [],
        account: {
          id: "portfolio",
          assetClassId: "EQUITIES",
          kind: "account",
          explanation: null,
          legacyScopes: [],
          instrumentLabel: "USD",
          sources: ["HOLDING", "EXPLICIT"],
          calculatedRealizedGainLoss: 3,
          calculatedUnrealizedGainLoss: -1,
          recordedGainLoss: 5,
        },
      },
    ],
  },
  {
    id: "asset-class:unclassified",
    label: "Unclassified",
    realizedGainLoss: 20,
    unrealizedGainLoss: -30,
    totalGainLoss: -10,
    children: [],
  },
];

describe("asset-class table rows", () => {
  test("nests account rows below investment groups without making groups navigable", () => {
    const group = {
      ...hierarchy[0]!,
      id: "gain-loss-investment:EQUITIES:managed-portfolios",
      label: "Total Value Accounts",
    };
    const rows = flattenGainsLossesHierarchyRows([
      { ...hierarchy[0]!, children: [group] },
    ]);
    expect(rows.map((row) => [row.id, row.parentId, row.accountId])).toEqual([
      ["asset-class:EQUITIES", undefined, undefined],
      [group.id, "asset-class:EQUITIES", undefined],
      ["opaque-row", group.id, "portfolio"],
    ]);
  });
  test("flattens classes and accounts once, retaining metadata for mixed-source explanations", () => {
    expect(flattenGainsLossesHierarchyRows(hierarchy)).toEqual([
      {
        id: "asset-class:EQUITIES",
        parentId: undefined,
        name: "Equities",
        realizedGainLoss: 8,
        unrealizedGainLoss: -1,
        totalGainLoss: 7,
      },
      {
        id: "opaque-row",
        parentId: "asset-class:EQUITIES",
        name: "USD Equity Portfolio",
        accountId: "portfolio",
        realizedGainLoss: 8,
        unrealizedGainLoss: -1,
        totalGainLoss: 7,
      },
      {
        id: "asset-class:unclassified",
        parentId: undefined,
        name: "Unclassified",
        realizedGainLoss: 20,
        unrealizedGainLoss: -30,
        totalGainLoss: -10,
      },
    ]);
  });
  test("sums classes without double-counting account leaves", () => {
    expect(sumTopLevelRealizedGainLoss(hierarchy)).toBe(28);
    expect(sumTopLevelUnrealizedGainLoss(hierarchy)).toBe(-31);
    expect(sumTopLevelTotalGainLoss(hierarchy)).toBe(-3);
  });
  test("supports an empty hierarchy", () => {
    expect(flattenGainsLossesHierarchyRows([])).toEqual([]);
    expect(sumTopLevelRealizedGainLoss([])).toBe(0);
    expect(sumTopLevelUnrealizedGainLoss([])).toBe(0);
    expect(sumTopLevelTotalGainLoss([])).toBe(0);
  });
});
