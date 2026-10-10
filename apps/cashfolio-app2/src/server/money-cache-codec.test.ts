import { describe, expect, it } from "vitest";
import { MoneyDecimal, toMoney } from "../shared/money";
import { decodeMoneyCache, encodeMoneyCache } from "./money-cache-codec";
import { toNumericMoney } from "./money-boundary";

describe("internal monetary cache codec", () => {
  it("round-trips exact decimals, dates, nulls, and ordinary numeric counts", () => {
    const original = {
      amount: toMoney("9007199254740993.123456789123456789"),
      date: new Date("2026-01-02T00:00:00Z"),
      rows: [{ amount: toMoney("-0.0000000000000000001"), missing: null }],
      count: 2,
    };
    const json = JSON.stringify(encodeMoneyCache(original));
    expect(JSON.parse(json).amount).toEqual({
      __cashfolioDecimal: "9007199254740993.123456789123456789",
    });
    const restored = decodeMoneyCache<typeof original>(JSON.parse(json));
    expect(restored).toEqual(original);
    expect(restored.amount).toBeInstanceOf(MoneyDecimal);
    expect(restored.date).toBeInstanceOf(Date);
    expect(restored.amount.plus(restored.rows[0]!.amount).toString()).toBe(
      "9007199254740993.1234567891234567889",
    );
  });

  it.each(["NaN", "Infinity", "-Infinity", "not-a-decimal", null, 1])(
    "rejects malformed decimal payload %s",
    (value) => {
      expect(() => decodeMoneyCache({ __cashfolioDecimal: value })).toThrow();
    },
  );

  it.each([null, "2026-01-01", Infinity, 1e20])(
    "rejects malformed date payload %s",
    (value) => {
      expect(() => decodeMoneyCache({ __cashfolioDateMs: value })).toThrow();
    },
  );

  it("constructs numeric API fields only at the response boundary", () => {
    const internal = {
      amount: toMoney("0.3"),
      rows: [{ amount: toMoney("-2.345"), missing: null }],
      date: new Date("2026-01-01T00:00:00Z"),
    };
    const response = toNumericMoney(internal);
    expect(response).toEqual({
      amount: 0.3,
      rows: [{ amount: -2.345, missing: null }],
      date: internal.date,
    });
    expect(typeof JSON.parse(JSON.stringify(response)).amount).toBe("number");
    expect(internal.amount.toString()).toBe("0.3");
    expect(() => toNumericMoney(toMoney("1e400"))).toThrow(/overflowed/);
  });
});
