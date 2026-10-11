import { describe, expect, test } from "vitest";
import { Unit } from "../.prisma-client/enums";
import {
  createDisplayNumberFormatter,
  createRateNumberFormatter,
  getCryptocurrencyDecimals,
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "./unit-format";

describe("getCurrencyDecimals", () => {
  test.each([
    ["COP", 0],
    ["KRW", 0],
    ["JPY", 0],
    ["CHF", 2],
    ["USD", 2],
    ["BHD", 3],
    ["KWD", 3],
    ["CLF", 4],
    ["IQD", 0],
    ["BYR", 0],
  ])("returns CLDR display digits for %s", (currency, decimals) => {
    expect(getCurrencyDecimals(currency)).toBe(decimals);
  });

  test("normalizes currency codes", () => {
    expect(getCurrencyDecimals(" cop ")).toBe(0);
    expect(getCurrencyDecimals("kwd")).toBe(3);
  });

  test("uses 2 decimals for default, unsupported, or missing currencies", () => {
    expect(getCurrencyDecimals("CNH")).toBe(2);
    expect(getCurrencyDecimals("XXX_UNKNOWN")).toBe(2);
    expect(getCurrencyDecimals(null)).toBe(2);
    expect(getCurrencyDecimals(undefined)).toBe(2);
    expect(getCurrencyDecimals(" ")).toBe(2);
  });
});

describe("getCryptocurrencyDecimals", () => {
  test("uses Kraken display_decimals where available", () => {
    expect(getCryptocurrencyDecimals("BTC")).toBe(5);
    expect(getCryptocurrencyDecimals("DOGE")).toBe(2);
    expect(getCryptocurrencyDecimals("ETH")).toBe(5);
    expect(getCryptocurrencyDecimals("USDT")).toBe(4);
  });

  test("falls back to 8 decimals for uncovered symbols", () => {
    expect(getCryptocurrencyDecimals("AION")).toBe(8);
    expect(getCryptocurrencyDecimals(undefined)).toBe(8);
  });
});

describe("getUnitDisplayDecimals", () => {
  test("resolves security to 0 decimals", () => {
    expect(getUnitDisplayDecimals({ unit: Unit.SECURITY })).toBe(0);
  });

  test("resolves currency and crypto via their lookup tables", () => {
    expect(
      getUnitDisplayDecimals({
        unit: Unit.CURRENCY,
        currency: "JPY",
      }),
    ).toBe(0);

    expect(
      getUnitDisplayDecimals({
        unit: Unit.CRYPTOCURRENCY,
        cryptocurrency: "USDT",
      }),
    ).toBe(4);
  });
});

describe("createDisplayNumberFormatter", () => {
  test.each([
    ["COP", "12"],
    ["KRW", "12"],
    ["CHF", "12.00"],
    ["KWD", "12.000"],
    ["CLF", "12.0000"],
  ])("formats amounts with %s display digits", (currency, expected) => {
    const formatter = createDisplayNumberFormatter({
      locale: "en-CH",
      style: "currency",
      currency,
      decimals: getCurrencyDecimals(currency),
    });

    expect(
      formatter
        .formatToParts(12)
        .filter((part) => part.type !== "currency" && part.type !== "literal")
        .map((part) => part.value)
        .join(""),
    ).toBe(expected);
  });

  test("creates a decimal formatter with fixed display precision", () => {
    const formatter = createDisplayNumberFormatter({
      locale: "en-CH",
      decimals: 0,
    });

    expect(formatter.format(12.99)).toBe("13");
  });
});

describe("createRateNumberFormatter", () => {
  test("keeps useful fractional precision for rates", () => {
    const formatter = createRateNumberFormatter({
      locale: "en-CH",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });

    expect(formatter.format(0.0067891)).toBe("0.006789");
    expect(formatter.format(12)).toBe("12.00");
  });
});
