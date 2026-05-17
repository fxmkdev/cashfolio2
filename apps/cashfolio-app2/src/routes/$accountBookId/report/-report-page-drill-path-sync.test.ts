import { describe, expect, test } from "vitest";
import type { BreakdownHierarchyNode } from "@/shared/breakdown-hierarchy";
import type { GainsLossesBreakdownNode } from "./-gains-losses/-gains-losses-breakdown-types";
import { getSyncedReportDrillPaths } from "./-report-page-drill-path-sync";

function breakdownNode(args: {
  id: string;
  children?: BreakdownHierarchyNode[];
}): BreakdownHierarchyNode {
  return {
    id: args.id,
    label: args.id,
    kind: "group",
    amount: 1,
    children: args.children ?? [],
  };
}

function gainsLossesNode(args: {
  id: string;
  children?: GainsLossesBreakdownNode[];
}): GainsLossesBreakdownNode {
  return {
    id: args.id,
    label: args.id,
    realizedGainLoss: 1,
    unrealizedGainLoss: 0,
    totalGainLoss: 1,
    children: args.children ?? [],
  };
}

const validBreakdownHierarchy = [
  breakdownNode({
    id: "group:root",
    children: [
      breakdownNode({
        id: "group:child",
        children: [breakdownNode({ id: "group:leaf" })],
      }),
    ],
  }),
];
const validGainsLossesHierarchy = [
  gainsLossesNode({
    id: "unit-type:fx",
    children: [gainsLossesNode({ id: "unit:fx:USD" })],
  }),
];

function getBaseSyncInput() {
  return {
    drillPathByBreakdown: {
      expense: ["group:root"],
      income: ["group:root"],
    },
    drillPathByAllocationBreakdown: {
      asset: ["group:root"],
      liability: ["group:root"],
    },
    drillPathByGainsLosses: ["unit-type:fx"],
    expenseBreakdownHierarchy: validBreakdownHierarchy,
    incomeBreakdownHierarchy: validBreakdownHierarchy,
    assetBreakdownHierarchy: validBreakdownHierarchy,
    liabilityBreakdownHierarchy: validBreakdownHierarchy,
    gainsLossesBreakdownHierarchy: validGainsLossesHierarchy,
  };
}

describe("getSyncedReportDrillPaths", () => {
  test("reports no changes when every stored path is still valid", () => {
    const synced = getSyncedReportDrillPaths(getBaseSyncInput());

    expect(synced).toMatchObject({
      drillPathByBreakdown: {
        expense: ["group:root"],
        income: ["group:root"],
      },
      drillPathByAllocationBreakdown: {
        asset: ["group:root"],
        liability: ["group:root"],
      },
      drillPathByGainsLosses: ["unit-type:fx"],
      hasBreakdownChanges: false,
      hasAllocationBreakdownChanges: false,
      hasGainsLossesChanges: false,
    });
  });

  test("clamps expense and income paths independently", () => {
    const synced = getSyncedReportDrillPaths({
      ...getBaseSyncInput(),
      drillPathByBreakdown: {
        expense: ["group:root", "group:missing"],
        income: ["group:root", "group:child"],
      },
    });

    expect(synced.drillPathByBreakdown).toEqual({
      expense: ["group:root"],
      income: ["group:root", "group:child"],
    });
    expect(synced.hasBreakdownChanges).toBe(true);
    expect(synced.hasAllocationBreakdownChanges).toBe(false);
    expect(synced.hasGainsLossesChanges).toBe(false);
  });

  test("clamps asset and liability paths independently", () => {
    const synced = getSyncedReportDrillPaths({
      ...getBaseSyncInput(),
      drillPathByAllocationBreakdown: {
        asset: ["group:root", "group:child"],
        liability: ["group:root", "group:missing"],
      },
    });

    expect(synced.drillPathByAllocationBreakdown).toEqual({
      asset: ["group:root", "group:child"],
      liability: ["group:root"],
    });
    expect(synced.hasBreakdownChanges).toBe(false);
    expect(synced.hasAllocationBreakdownChanges).toBe(true);
    expect(synced.hasGainsLossesChanges).toBe(false);
  });

  test("clamps gains/losses paths independently", () => {
    const synced = getSyncedReportDrillPaths({
      ...getBaseSyncInput(),
      drillPathByGainsLosses: ["unit-type:fx", "unit:missing"],
    });

    expect(synced.drillPathByGainsLosses).toEqual(["unit-type:fx"]);
    expect(synced.hasBreakdownChanges).toBe(false);
    expect(synced.hasAllocationBreakdownChanges).toBe(false);
    expect(synced.hasGainsLossesChanges).toBe(true);
  });

  test("returns empty clamped paths for empty hierarchies", () => {
    const synced = getSyncedReportDrillPaths({
      ...getBaseSyncInput(),
      expenseBreakdownHierarchy: [],
      incomeBreakdownHierarchy: [],
      assetBreakdownHierarchy: [],
      liabilityBreakdownHierarchy: [],
      gainsLossesBreakdownHierarchy: [],
    });

    expect(synced.drillPathByBreakdown).toEqual({
      expense: [],
      income: [],
    });
    expect(synced.drillPathByAllocationBreakdown).toEqual({
      asset: [],
      liability: [],
    });
    expect(synced.drillPathByGainsLosses).toEqual([]);
  });
});
