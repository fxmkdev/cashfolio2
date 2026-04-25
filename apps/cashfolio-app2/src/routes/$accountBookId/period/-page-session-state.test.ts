import { describe, expect, test } from "vitest";
import {
  getDefaultPeriodPageSessionState,
  parseStoredPeriodPageSessionState,
} from "./-page-session-state";

describe("getDefaultPeriodPageSessionState", () => {
  test("defaults gains/losses chart to waterfall with empty drill path", () => {
    expect(getDefaultPeriodPageSessionState()).toMatchObject({
      selectedGainsLossesChartType: "waterfall",
      drillPathByGainsLosses: [],
    });
  });
});

describe("parseStoredPeriodPageSessionState", () => {
  test("restores persisted gains/losses chart type and drill path", () => {
    const parsed = parseStoredPeriodPageSessionState({
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
    const parsed = parseStoredPeriodPageSessionState({
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
