import { describe, expect, it } from "vitest";
import {
  aggregateAccountGainLoss,
  EMPTY_GAIN_LOSS_SUMMARY,
} from "./account-gain-loss";
import { toNumericMoney } from "../server/money-boundary";

describe("G/L aggregation", () => {
  it("adds exact amounts, ignores inapplicable accounts, and withholds components independently", () => {
    const result = aggregateAccountGainLoss([
      {
        applicable: true,
        summary: {
          realizedGainLoss: "0.1",
          unrealizedGainLoss: "0.2",
          totalGainLoss: "0.3",
        },
        diagnostics: [],
      },
      {
        applicable: true,
        summary: {
          realizedGainLoss: "0.2",
          unrealizedGainLoss: null,
          totalGainLoss: null,
        },
        diagnostics: [{ date: "2026-01-01", message: "Missing close" }],
      },
      { applicable: false, summary: EMPTY_GAIN_LOSS_SUMMARY, diagnostics: [] },
    ]);
    expect(toNumericMoney(result.summary)).toEqual({
      realizedGainLoss: 0.3,
      unrealizedGainLoss: null,
      totalGainLoss: null,
    });
    expect(result.diagnostics).toHaveLength(1);
  });
  it("leaves groups without eligible descendants inapplicable", () => {
    expect(aggregateAccountGainLoss([])).toEqual({
      applicable: false,
      summary: EMPTY_GAIN_LOSS_SUMMARY,
      diagnostics: [],
    });
  });
});
