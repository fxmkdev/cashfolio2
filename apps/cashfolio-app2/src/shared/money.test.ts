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

describe("monetary precision boundaries", () => {
  test("rejects non-finite numeric, string, and database-like inputs", async () => {
    const { toMoney } = await import("./money");
    for (const input of [
      NaN,
      Infinity,
      -Infinity,
      "NaN",
      "Infinity",
      { toString: () => "-Infinity" },
    ]) {
      expect(() => toMoney(input)).toThrow();
    }
  });

  test("preserves high-precision database values through large cancellation", async () => {
    const { toMoney } = await import("./money");
    const databaseValue = {
      toString: () => "9007199254740993.123456789123456789",
    };
    expect(
      moneySum([
        toMoney(databaseValue),
        "-9007199254740993",
        "-0.123456789123456789",
      ]).toString(),
    ).toBe("0");
    expect(
      moneySum(
        Array.from({ length: 1000 }, () => "0.0000000000000000001"),
      ).toString(),
    ).toBe("1e-16");
  });

  test("rounds positive and negative half ties to even", () => {
    expect(moneyRound2("-2.345").toString()).toBe("-2.34");
    expect(moneyRound2("-2.355").toString()).toBe("-2.36");
  });
});
