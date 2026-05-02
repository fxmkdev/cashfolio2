import { describe, expect, test } from "vitest";
import {
  moneyDivide,
  moneyMultiply,
  moneyRound2,
  moneySum,
  toMoneyNumber,
} from "./money";

describe("money helpers", () => {
  test("keeps decimal arithmetic exact for 0.1 + 0.2", () => {
    const total = moneySum([0.1, 0.2]);
    expect(total.toString()).toBe("0.3");
  });

  test("uses half-even rounding for two decimal places", () => {
    expect(moneyRound2("2.345").toString()).toBe("2.34");
    expect(moneyRound2("2.355").toString()).toBe("2.36");
  });

  test("avoids floating drift in multiply/divide chains", () => {
    const converted = moneyMultiply("0.3", "3.3333333333333333");
    const unitPrice = moneyDivide(converted, "0.3");

    expect(unitPrice.toString()).toBe("3.3333333333333333");
    expect(toMoneyNumber(converted)).toBeCloseTo(1, 12);
  });
});
