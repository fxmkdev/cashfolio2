import { expect, it } from "vitest";
import { getUnitFilterValue } from "./unit-filter-value";

it.each([
  ["CURRENCY", "CHF"],
  ["CRYPTOCURRENCY", "BTC"],
  ["SECURITY", "AAPL"],
  [null, null],
] as const)("uses the raw identifier for %s", (unit, expected) => {
  expect(
    getUnitFilterValue({
      unit,
      currency: "CHF",
      cryptocurrency: "BTC",
      symbol: "AAPL",
    }),
  ).toBe(expected);
});

it("handles synthetic and missing rows without inventing identifiers", () => {
  expect(getUnitFilterValue(undefined)).toBeNull();
  expect(
    getUnitFilterValue({
      unit: "SECURITY",
      currency: null,
      cryptocurrency: null,
      symbol: null,
    }),
  ).toBeNull();
});
