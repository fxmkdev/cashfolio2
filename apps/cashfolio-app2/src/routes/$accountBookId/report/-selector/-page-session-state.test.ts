import { describe, expect, test } from "vitest";
import {
  getDefaultReportPageSessionState,
  parseStoredReportPageSessionState,
} from "./-page-session-state";

describe("getDefaultReportPageSessionState", () => {
  test("defaults gains/losses chart to waterfall with empty drill path", () => {
    expect(getDefaultReportPageSessionState()).toMatchObject({
      selectedGainsLossesChartType: "waterfall",
      selectedChartType: "bar",
      selectedAllocationChartType: "donut",
      drillPathByBreakdown: {
        expense: [],
        income: [],
        cashFlow: [],
      },
      selectedGrouping: "accountStructure",
      drillPathsByGrouping: {
        accountStructure: { gainsLosses: [] },
        assetClass: { gainsLosses: [] },
      },
    });
  });
});

describe("parseStoredReportPageSessionState", () => {
  test("restores independent grouping paths and sanitizes malformed state", () => {
    const parsed = parseStoredReportPageSessionState({
      selectedGrouping: "assetClass",
      drillPathsByGrouping: {
        accountStructure: {
          allocation: { asset: ["group:pension"], liability: [] },
          gainsLosses: ["group:pension"],
        },
        assetClass: {
          allocation: { asset: ["asset-class:EQUITIES"], liability: null },
          gainsLosses: ["asset-class:EQUITIES", 42, " "],
        },
      },
    });
    expect(parsed.selectedGrouping).toBe("assetClass");
    expect(parsed.drillPathsByGrouping.accountStructure.gainsLosses).toEqual([
      "group:pension",
    ]);
    expect(parsed.drillPathsByGrouping.assetClass).toEqual({
      allocation: { asset: ["asset-class:EQUITIES"], liability: [] },
      gainsLosses: ["asset-class:EQUITIES"],
    });
    expect(
      parseStoredReportPageSessionState({
        selectedGrouping: "bogus",
        drillPathsByGrouping: { assetClass: 1 },
      }).selectedGrouping,
    ).toBe("accountStructure");
  });
  test("restores persisted gains/losses chart type and drill path", () => {
    const parsed = parseStoredReportPageSessionState({
      selectedBreakdown: "income",
      selectedChartType: "bar",
      selectedAllocationBreakdown: "liability",
      selectedAllocationChartType: "table",
      selectedGainsLossesChartType: "table",
      drillPathByBreakdown: {
        expense: ["group:a"],
        income: ["group:b"],
        cashFlow: ["group:cash"],
      },
      drillPathByAllocationBreakdown: {
        asset: ["group:c"],
        liability: ["group:d"],
      },
      drillPathByGainsLosses: ["unit-type:fx", "unit:fx:USD"],
    });

    expect(parsed).toMatchObject({
      selectedBreakdown: "income",
      selectedChartType: "bar",
      selectedAllocationBreakdown: "liability",
      selectedAllocationChartType: "table",
      selectedGainsLossesChartType: "table",
      drillPathByBreakdown: {
        expense: ["group:a"],
        income: ["group:b"],
        cashFlow: ["group:cash"],
      },
      drillPathsByGrouping: {
        accountStructure: {
          allocation: { asset: ["group:c"], liability: ["group:d"] },
          gainsLosses: [],
        },
        assetClass: {
          allocation: { asset: [], liability: [] },
          gainsLosses: ["unit-type:fx", "unit:fx:USD"],
        },
      },
    });
  });

  test("keeps backward compatibility with legacy stored state", () => {
    const parsed = parseStoredReportPageSessionState({
      selectedBreakdown: "expense",
      selectedChartType: "donut",
      selectedAllocationBreakdown: "asset",
      selectedAllocationChartType: "bar",
      drillPathByBreakdown: { expense: ["group:e"], income: [] },
      drillPathByAllocationBreakdown: {
        asset: ["group:a"],
        liability: ["group:l"],
      },
    });

    expect(parsed.selectedGainsLossesChartType).toBe("waterfall");
    expect(parsed.selectedChartType).toBe("bar");
    expect(parsed.selectedAllocationChartType).toBe("donut");
    expect(parsed.drillPathByBreakdown.cashFlow).toEqual([]);
    expect(parsed.drillPathsByGrouping.assetClass.gainsLosses).toEqual([]);
  });

  test.each(["donut", "bar", null, "invalid"])(
    "normalizes removed or invalid modes (%s) and preserves Table",
    (legacyMode) => {
      const parsed = parseStoredReportPageSessionState({
        selectedChartType: legacyMode === "bar" ? "donut" : legacyMode,
        selectedAllocationChartType:
          legacyMode === "donut" ? "bar" : legacyMode,
        drillPathByBreakdown: { expense: ["group:expense"] },
        drillPathByAllocationBreakdown: { asset: ["group:asset"] },
      });
      expect(parsed.selectedChartType).toBe("bar");
      expect(parsed.selectedAllocationChartType).toBe("donut");
      expect(parsed.drillPathByBreakdown.expense).toEqual(["group:expense"]);
      expect(
        parsed.drillPathsByGrouping.accountStructure.allocation.asset,
      ).toEqual(["group:asset"]);
      const table = parseStoredReportPageSessionState({
        selectedChartType: "table",
        selectedAllocationChartType: "table",
      });
      expect(table.selectedChartType).toBe("table");
      expect(table.selectedAllocationChartType).toBe("table");
    },
  );
});
