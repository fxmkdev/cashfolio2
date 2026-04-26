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
        statsRaw: {
          totalReturn: 100.001,
          savings: 80.002,
          income: 0,
          expenses: 20.003,
          gainsLosses: 20.004,
          realizedGainLoss: 13.005,
          unrealizedGainLoss: 7.006,
          endOfPeriodNetWorth: 1000.007,
          endOfPeriodAssets: 1200.008,
          endOfPeriodLiabilities: 200.009,
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
        statsRaw: {
          totalReturn: -5.1,
          savings: -30.2,
          income: 100.3,
          expenses: 130.4,
          gainsLosses: -10.5,
          realizedGainLoss: -7.6,
          unrealizedGainLoss: -3.7,
          endOfPeriodNetWorth: -50.8,
          endOfPeriodAssets: 500.9,
          endOfPeriodLiabilities: 550.1,
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
      exactValue: "CHF:-10.50",
    });
    expect(gainsLossesCard?.secondaryValue).toBeUndefined();
    expect(liabilitiesCard?.valueColor).toBe("red");
  });
});
