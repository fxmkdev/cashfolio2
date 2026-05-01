import { describe, expect, test } from "vitest";
import { Unit } from "../.prisma-client/enums";
import {
  createDisplayNumberFormatter,
  getCryptocurrencyDecimals,
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "./unit-format";

describe("getCurrencyDecimals", () => {
  test("returns ISO minor units for known currencies", () => {
    expect(getCurrencyDecimals("CHF")).toBe(2);
    expect(getCurrencyDecimals("JPY")).toBe(0);
    expect(getCurrencyDecimals("BHD")).toBe(3);
  });

  test("falls back to 2 decimals for non-ISO/unsupported currencies", () => {
    expect(getCurrencyDecimals("CNH")).toBe(2);
    expect(getCurrencyDecimals("XXX_UNKNOWN")).toBe(2);
    expect(getCurrencyDecimals(null)).toBe(2);
  });
});

describe("getCryptocurrencyDecimals", () => {
  test("uses Kraken display_decimals where available", () => {
    expect(getCryptocurrencyDecimals("BTC")).toBe(8);
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
  test("creates a decimal formatter with fixed display precision", () => {
    const formatter = createDisplayNumberFormatter({
      locale: "en-CH",
      decimals: 0,
    });

    expect(formatter.format(12.99)).toBe("13");
  });
});
