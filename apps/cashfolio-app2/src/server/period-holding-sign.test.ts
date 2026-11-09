import { describe, expect, test } from "vitest";
import { toMoney } from "../shared/money";
import { toNumericMoney } from "./money-boundary";
import { computeHoldingGainLossForEventSeries } from "./period.test-support";

describe("computeHoldingGainLossForEventSeries", () => {
  test("uses the same sign convention as transaction gain/loss", () => {
    const gainLoss = computeHoldingGainLossForEventSeries({
      initialBalance: toMoney(1000),
      initialRate: toMoney(1.2),
      events: [
        { rate: toMoney(1.1), balanceDelta: toMoney(200) },
        { rate: toMoney(1.05), balanceDelta: toMoney(0) },
      ],
    });

    // event 1: 1000 * (1.1 - 1.2) = -100
    // event 2: 1200 * (1.05 - 1.1) = -60
    expect(toNumericMoney(gainLoss)).toBeCloseTo(-160, 10);
  });
});
