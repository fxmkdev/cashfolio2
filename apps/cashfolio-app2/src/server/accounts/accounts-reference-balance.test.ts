import { describe, expect, test, vi } from "vitest";
import { computeRawBalanceInReferenceCurrency } from "./accounts-reference-balance";

describe("computeRawBalanceInReferenceCurrency", () => {
  test("converts currency balances and short-circuits when source equals reference", async () => {
    const getCurrencyToReferenceRate = vi.fn().mockResolvedValue(1.1);

    const converted = await computeRawBalanceInReferenceCurrency({
      type: "ASSET",
      unit: "CURRENCY",
      currency: "EUR",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      rawBalance: 100,
      referenceCurrency: "CHF",
      getCurrencyToReferenceRate,
      getCryptocurrencyToReferenceRate: vi.fn(),
      getSecurityToReferenceRate: vi.fn(),
    });

    expect(converted).toBeCloseTo(110);
    expect(getCurrencyToReferenceRate).toHaveBeenCalledWith("EUR");

    const noConversion = await computeRawBalanceInReferenceCurrency({
      type: "ASSET",
      unit: "CURRENCY",
      currency: "chf",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      rawBalance: 10,
      referenceCurrency: "CHF",
      getCurrencyToReferenceRate,
      getCryptocurrencyToReferenceRate: vi.fn(),
      getSecurityToReferenceRate: vi.fn(),
    });

    expect(noConversion).toBe(10);
  });

  test("handles crypto and security conversion edge cases", async () => {
    const cryptoRate = vi.fn().mockResolvedValue(25000);
    const securityRate = vi.fn().mockResolvedValue(180);

    const crypto = await computeRawBalanceInReferenceCurrency({
      type: "LIABILITY",
      unit: "CRYPTOCURRENCY",
      currency: null,
      cryptocurrency: "btc",
      symbol: null,
      tradeCurrency: null,
      rawBalance: 2,
      referenceCurrency: "CHF",
      getCurrencyToReferenceRate: vi.fn(),
      getCryptocurrencyToReferenceRate: cryptoRate,
      getSecurityToReferenceRate: securityRate,
    });

    expect(crypto).toBe(50000);
    expect(cryptoRate).toHaveBeenCalledWith("BTC");

    const security = await computeRawBalanceInReferenceCurrency({
      type: "ASSET",
      unit: "SECURITY",
      currency: null,
      cryptocurrency: null,
      symbol: "aapl",
      tradeCurrency: "usd",
      rawBalance: 3,
      referenceCurrency: "CHF",
      getCurrencyToReferenceRate: vi.fn(),
      getCryptocurrencyToReferenceRate: vi.fn(),
      getSecurityToReferenceRate: securityRate,
    });

    expect(security).toBe(540);
    expect(securityRate).toHaveBeenCalledWith("AAPL", "USD");

    const missingTradeCurrency = await computeRawBalanceInReferenceCurrency({
      type: "ASSET",
      unit: "SECURITY",
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: null,
      rawBalance: 3,
      referenceCurrency: "CHF",
      getCurrencyToReferenceRate: vi.fn(),
      getCryptocurrencyToReferenceRate: vi.fn(),
      getSecurityToReferenceRate: securityRate,
    });

    expect(missingTradeCurrency).toBeNull();
  });

  test("returns null for non asset/liability types and incomplete unit metadata", async () => {
    const result = await computeRawBalanceInReferenceCurrency({
      type: "EQUITY",
      unit: "CURRENCY",
      currency: "USD",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      rawBalance: 20,
      referenceCurrency: "CHF",
      getCurrencyToReferenceRate: vi.fn(),
      getCryptocurrencyToReferenceRate: vi.fn(),
      getSecurityToReferenceRate: vi.fn(),
    });

    expect(result).toBeNull();

    const missingCurrency = await computeRawBalanceInReferenceCurrency({
      type: "ASSET",
      unit: "CURRENCY",
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      rawBalance: 0,
      referenceCurrency: "CHF",
      getCurrencyToReferenceRate: vi.fn(),
      getCryptocurrencyToReferenceRate: vi.fn(),
      getSecurityToReferenceRate: vi.fn(),
    });

    expect(missingCurrency).toBeNull();
  });
});
