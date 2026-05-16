import { describe, expect, test } from "vitest";
import {
  getDefaultReportPageSessionState,
  parseStoredReportPageSessionState,
} from "./-page-session-state";

describe("getDefaultReportPageSessionState", () => {
  test("defaults gains/losses chart to waterfall with empty drill path", () => {
    expect(getDefaultReportPageSessionState()).toMatchObject({
      selectedGainsLossesChartType: "waterfall",
      drillPathByGainsLosses: [],
    });
  });
});

describe("parseStoredReportPageSessionState", () => {
  test("restores persisted gains/losses chart type and drill path", () => {
    const parsed = parseStoredReportPageSessionState({
      selectedBreakdown: "income",
      selectedChartType: "bar",
      selectedAllocationBreakdown: "liability",
      selectedAllocationChartType: "table",
      selectedGainsLossesChartType: "table",
      drillPathByBreakdown: { expense: ["group:a"], income: ["group:b"] },
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
      drillPathByGainsLosses: ["unit-type:fx", "unit:fx:USD"],
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
    expect(parsed.drillPathByGainsLosses).toEqual([]);
  });
});
