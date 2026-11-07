import { describe, expect, it } from "vitest";
import { toMoney } from "../../../shared/money";
import { calculateMoneyWeightedReturn } from "./return-irr";

function irr(flows: [number, string][], duration = 365) {
  return calculateMoneyWeightedReturn(
    flows.map(([days, amount]) => ({ days, amount: toMoney(amount) })),
    duration,
  ).toNumber();
}
describe("dated money-weighted returns", () => {
  it("solves positive, zero, and negative returns without an initial guess", () => {
    expect(
      irr([
        [0, "-100"],
        [365, "110"],
      ]),
    ).toBeCloseTo(0.1, 12);
    expect(
      irr([
        [0, "-100"],
        [365, "100"],
      ]),
    ).toBeCloseTo(0, 12);
    expect(
      irr([
        [0, "-100"],
        [365, "1"],
      ]),
    ).toBeCloseTo(-0.99, 12);
  });
  it("preserves decimal precision and combines equal-date cash flows", () => {
    expect(
      irr([
        [0, "-0.100000000000000000001"],
        [0, "-0.2"],
        [365, "0.33"],
      ]),
    ).toBeCloseTo(0.1, 12);
  });
  it("weights intermediate funding by actual days", () => {
    expect(
      irr(
        [
          [0, "-100"],
          [365, "-100"],
          [730, "231"],
        ],
        730,
      ),
    ).toBeCloseTo(0.21, 12);
  });
  it("rejects multiple roots, including close roots", () => {
    expect(() =>
      irr(
        [
          [0, "-100"],
          [365, "230"],
          [730, "-132"],
        ],
        730,
      ),
    ).toThrow("Multiple");
    expect(() =>
      irr(
        [
          [0, "-100"],
          [365, "220.001"],
          [730, "-121.0011"],
        ],
        730,
      ),
    ).toThrow("Multiple");
  });
  it("detects a tangent root and rejects cash flows without a root", () => {
    expect(
      irr(
        [
          [0, "-100"],
          [365, "200"],
          [730, "-100"],
        ],
        730,
      ),
    ).toBeCloseTo(0, 10);
    expect(() =>
      irr(
        [
          [0, "-100"],
          [365, "50"],
          [730, "-100"],
        ],
        730,
      ),
    ).toThrow("No money-weighted");
  });
  it("recognizes total loss and validates invested capital", () => {
    expect(irr([[0, "-100"]])).toBe(-1);
    expect(() => irr([[0, "100"]])).toThrow("requires invested capital");
    expect(() =>
      irr(
        [
          [0, "-100"],
          [0, "100"],
        ],
        0,
      ),
    ).toThrow("duration");
  });
});
