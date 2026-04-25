import { describe, expect, test } from "vitest";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import { buildGainsLossesWaterfallModel } from "./-gains-losses-waterfall-model";

describe("buildGainsLossesWaterfallModel", () => {
  test("keeps top-level node order in chart data", () => {
    const model = buildGainsLossesWaterfallModel({
      nodes: [
        {
          id: "unit-type:fx",
          label: "FX",
          realizedGainLoss: 2,
          unrealizedGainLoss: 1,
          totalGainLoss: 3,
          children: [],
        },
        {
          id: "unit-type:security",
          label: "Security",
          realizedGainLoss: 4,
          unrealizedGainLoss: -2,
          totalGainLoss: 2,
          children: [],
        },
      ] satisfies GainsLossesBreakdownNode[],
    });

    expect(model.data.map((datum) => datum.id)).toEqual([
      "unit-type:fx",
      "unit-type:security",
    ]);
  });

  test("computes total bar position and aggregated totals", () => {
    const model = buildGainsLossesWaterfallModel({
      nodes: [
        {
          id: "unit-type:fx",
          label: "FX",
          realizedGainLoss: 2,
          unrealizedGainLoss: 1,
          totalGainLoss: 3,
          children: [],
        },
        {
          id: "unit-type:security",
          label: "Security",
          realizedGainLoss: 4,
          unrealizedGainLoss: -2,
          totalGainLoss: 2,
          children: [],
        },
      ] satisfies GainsLossesBreakdownNode[],
    });

    expect(model.totals).toEqual([
      {
        totalType: "total",
        index: 1,
        axisLabel: "Total",
      },
    ]);
    expect(model.totalGainLoss).toBe(5);
  });

  test("handles mixed positive and negative contributions", () => {
    const model = buildGainsLossesWaterfallModel({
      nodes: [
        {
          id: "unit-type:fx",
          label: "FX",
          realizedGainLoss: -7,
          unrealizedGainLoss: 2,
          totalGainLoss: -5,
          children: [],
        },
        {
          id: "unit-type:security",
          label: "Security",
          realizedGainLoss: 1,
          unrealizedGainLoss: -3,
          totalGainLoss: -2,
          children: [],
        },
      ] satisfies GainsLossesBreakdownNode[],
    });

    expect(model.totalGainLoss).toBe(-7);
    expect(model.data.map((datum) => datum.totalGainLoss)).toEqual([-5, -2]);
  });

  test("falls back to finite totals when split values are missing or invalid", () => {
    const model = buildGainsLossesWaterfallModel({
      nodes: [
        {
          id: "unit-type:fx",
          label: "FX",
          gainLoss: "12.5",
          children: [],
        },
        {
          id: "unit-type:security",
          label: "Security",
          realizedGainLoss: "oops",
          unrealizedGainLoss: undefined,
          children: [],
        },
      ] as unknown as GainsLossesBreakdownNode[],
    });

    expect(model.data.map((datum) => datum.totalGainLoss)).toEqual([12.5, 0]);
    expect(model.totalGainLoss).toBe(12.5);
  });
});
