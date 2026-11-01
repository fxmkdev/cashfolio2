import { describe, expect, it } from "vitest";
import {
  getGainLossInvestmentGroup,
  UNKNOWN_GAIN_LOSS_UNIT,
} from "./investment-group";

const identity = {
  unit: "CURRENCY" as const,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
};

describe("investment grouping shared by Report and Accounts", () => {
  it.each([
    [
      { ...identity, currency: " usd " },
      { key: "CURRENCY:USD", label: "USD" },
    ],
    [
      { ...identity, unit: "CRYPTOCURRENCY" as const, cryptocurrency: " btc " },
      { key: "CRYPTOCURRENCY:BTC", label: "BTC" },
    ],
    [
      { ...identity, unit: "SECURITY" as const, symbol: "aapl" },
      { key: "SECURITY:AAPL", label: "AAPL" },
    ],
    [
      { ...identity, unit: "SECURITY" as const, symbol: " brk/b " },
      { key: "SECURITY:BRK%2FB", label: "BRK/B" },
    ],
  ])("normalizes unit identities %j", (account, expected) => {
    expect(getGainLossInvestmentGroup(account)).toEqual(expected);
  });

  it("combines securities across trade currencies, but keeps different unit types distinct", () => {
    const first = {
      ...identity,
      unit: "SECURITY" as const,
      symbol: "BTC",
      tradeCurrency: "USD",
    };
    const second = { ...first, tradeCurrency: "EUR" };
    expect(getGainLossInvestmentGroup(first)).toEqual(
      getGainLossInvestmentGroup(second),
    );
    expect(getGainLossInvestmentGroup(first).key).not.toBe(
      getGainLossInvestmentGroup({
        ...identity,
        unit: "CRYPTOCURRENCY",
        cryptocurrency: "BTC",
      }).key,
    );
  });

  it("groups portfolio-value accounts independently of currency", () => {
    for (const currency of ["CHF", "USD"])
      expect(
        getGainLossInvestmentGroup({
          ...identity,
          currency,
          trackingMethod: "TOTAL_PORTFOLIO_VALUE",
        }),
      ).toEqual({ key: "managed-portfolios", label: "Managed Portfolios" });
  });

  it.each([
    { ...identity, unit: null },
    { ...identity, currency: null },
    { ...identity, currency: "  " },
    { ...identity, unit: "SECURITY" as const },
    { ...identity, unit: "CRYPTOCURRENCY" as const },
  ])("retains unknown units %j", (account) => {
    expect(getGainLossInvestmentGroup(account)).toBe(UNKNOWN_GAIN_LOSS_UNIT);
  });
});
