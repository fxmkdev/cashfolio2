import { describe, expect, it } from "vitest";
import { buildPeriodPageStats } from "./-period-page-stats";

function createFormatter(prefix: string): Intl.NumberFormat {
  return {
    format: (value: number) => `${prefix}:${value.toFixed(2)}`,
  } as Intl.NumberFormat;
}

describe("buildPeriodPageStats", () => {
  it("uses em dash savings rate when income is zero", () => {
    const result = buildPeriodPageStats({
      overview: {
        stats: {
          totalReturn: 100,
          savings: 80,
          income: 0,
          expenses: 20,
          gainsLosses: 20,
          realizedGainLoss: 13,
          unrealizedGainLoss: 7,
          endOfPeriodNetWorth: 1000,
          endOfPeriodAssets: 1200,
          endOfPeriodLiabilities: 200,
        },
      } as never,
      currencyFormatter: createFormatter("CHF"),
      savingsRateFormatter: createFormatter("PCT"),
    });

    const savingsCard = result.statCards.find((card) => card.id === "savings");
    const gainsLossesCard = result.statCards.find(
      (card) => card.id === "gainsLosses",
    );

    expect(savingsCard?.secondaryValue).toBe("—");
    expect(gainsLossesCard?.label).toBe("Gain");
  });

  it("labels negative gains/losses as losses with red value", () => {
    const result = buildPeriodPageStats({
      overview: {
        stats: {
          totalReturn: -5,
          savings: -30,
          income: 100,
          expenses: 130,
          gainsLosses: -10,
          realizedGainLoss: -7,
          unrealizedGainLoss: -3,
          endOfPeriodNetWorth: -50,
          endOfPeriodAssets: 500,
          endOfPeriodLiabilities: 550,
        },
      } as never,
      currencyFormatter: createFormatter("CHF"),
      savingsRateFormatter: createFormatter("PCT"),
    });

    const gainsLossesCard = result.statCards.find(
      (card) => card.id === "gainsLosses",
    );
    const liabilitiesCard = result.endOfPeriodStatCards.find(
      (card) => card.id === "endOfPeriodLiabilities",
    );

    expect(gainsLossesCard).toMatchObject({
      label: "Loss",
      valueColor: "red",
    });
    expect(gainsLossesCard?.secondaryValue).toBeUndefined();
    expect(liabilitiesCard?.valueColor).toBe("red");
  });
});
