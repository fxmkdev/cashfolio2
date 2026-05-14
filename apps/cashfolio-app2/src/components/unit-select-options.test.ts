import { describe, expect, test } from "vitest";
import {
  buildCryptocurrencySelectData,
  buildCurrencySelectData,
} from "./unit-select-options";

describe("buildCurrencySelectData", () => {
  test("groups reference and active account currencies under Used", () => {
    const data = buildCurrencySelectData({
      usedCurrencies: ["CHF", "usd", "EUR", "USD"],
    });

    expect(data[0]).toEqual({
      group: "Used",
      items: [
        { value: "CHF", label: "CHF" },
        { value: "USD", label: "USD" },
        { value: "EUR", label: "EUR" },
      ],
    });
    expect(
      data
        .find((group) => group.group === "Others")
        ?.items.some((item) => item.value === "USD"),
    ).toBe(false);
  });

  test("keeps unknown selected currencies selectable in Others", () => {
    const data = buildCurrencySelectData({
      usedCurrencies: ["CHF"],
      selectedCurrencies: ["XTS"],
    });

    expect(data.find((group) => group.group === "Others")?.items[0]).toEqual({
      value: "XTS",
      label: "XTS",
    });
  });

  test("returns a valid Others-only list when no values are used", () => {
    const data = buildCurrencySelectData();

    expect(data[0]?.group).toBe("Others");
    expect(data[0]?.items.length).toBeGreaterThan(0);
  });

  test("can include full currency names when requested", () => {
    const data = buildCurrencySelectData({
      usedCurrencies: ["CHF"],
      compactLabels: false,
    });

    expect(data[0]?.items[0]).toEqual({
      value: "CHF",
      label: "CHF - Swiss Franc",
    });
  });
});

describe("buildCryptocurrencySelectData", () => {
  test("groups active account cryptocurrencies under Used", () => {
    const data = buildCryptocurrencySelectData({
      usedCryptocurrencies: ["btc", "ETH", "BTC"],
    });

    expect(data[0]).toEqual({
      group: "Used",
      items: [
        { value: "BTC", label: "BTC - Bitcoin" },
        { value: "ETH", label: "ETH - Ethereum" },
      ],
    });
    expect(
      data
        .find((group) => group.group === "Others")
        ?.items.some((item) => item.value === "BTC"),
    ).toBe(false);
  });

  test("can build compact labels for grid editors", () => {
    const data = buildCryptocurrencySelectData({
      usedCryptocurrencies: ["BTC"],
      compactLabels: true,
    });

    expect(data[0]?.items[0]).toEqual({ value: "BTC", label: "BTC" });
  });
});
