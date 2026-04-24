import { describe, expect, it } from "vitest";
import { buildContributionWaterfallModel } from "./-contribution-chart-card";

describe("buildContributionWaterfallModel", () => {
  it("builds realized/unrealized waterfall data in the expected order", () => {
    const model = buildContributionWaterfallModel({
      stats: {
        income: 100,
        expenses: 40,
        realizedGainLoss: 7,
        unrealizedGainLoss: 3,
      },
    });

    expect(model.data).toEqual([
      { label: "Income", amount: 100 },
      { label: "Expenses", amount: -40 },
      { label: "Realised Gain", amount: 7 },
      { label: "Unrealised Gain", amount: 3 },
    ]);
  });

  it("computes savings, gains/losses subtotal, and total return amounts", () => {
    const model = buildContributionWaterfallModel({
      stats: {
        income: 200,
        expenses: 140,
        realizedGainLoss: -30,
        unrealizedGainLoss: 10,
      },
    });

    expect(model.amountByLabel).toMatchObject({
      Income: 200,
      Expenses: -140,
      "Realised Loss": -30,
      "Unrealised Gain": 10,
      Savings: 60,
      "Loss (total)": -20,
      "Total Return": 40,
    });
  });

  it("defines both subtotals and final total at the configured positions", () => {
    const model = buildContributionWaterfallModel({
      stats: {
        income: 1,
        expenses: 1,
        realizedGainLoss: 0,
        unrealizedGainLoss: 0,
      },
    });

    expect(model.totals).toEqual([
      {
        totalType: "subtotal",
        index: 1,
        axisLabel: "Savings",
      },
      {
        totalType: "subtotal",
        index: 3,
        axisLabel: "Gains (total)",
      },
      {
        totalType: "total",
        index: 3,
        axisLabel: "Total Return",
      },
    ]);
  });
});
