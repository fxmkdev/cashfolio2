import { describe, expect, it } from "vitest";
import { buildContributionWaterfallModel } from "./-contribution-chart-card";

describe("buildContributionWaterfallModel", () => {
  it("uses a Gain label for non-negative gains/losses", () => {
    const model = buildContributionWaterfallModel({
      stats: {
        income: 100,
        expenses: 40,
        gainsLosses: 10,
      },
    });

    expect(model.data).toEqual([
      { label: "Income", amount: 100 },
      { label: "Expenses", amount: -40 },
      { label: "Gain", amount: 10 },
    ]);
  });

  it("uses a Loss label for negative gains/losses", () => {
    const model = buildContributionWaterfallModel({
      stats: {
        income: 200,
        expenses: 140,
        gainsLosses: -20,
      },
    });

    expect(model.amountByLabel).toMatchObject({
      Income: 200,
      Expenses: -140,
      Loss: -20,
      Savings: 60,
      "Total Return": 40,
    });
  });

  it("defines savings subtotal and final total at the configured positions", () => {
    const model = buildContributionWaterfallModel({
      stats: {
        income: 1,
        expenses: 1,
        gainsLosses: 0,
      },
    });

    expect(model.totals).toEqual([
      {
        totalType: "subtotal",
        index: 1,
        axisLabel: "Savings",
      },
      {
        totalType: "total",
        index: 2,
        axisLabel: "Total Return",
      },
    ]);
  });
});
