import { expect, test } from "vitest";
import { parseTickerMetadata, readCachedMetadata } from "./metadata-data";
const raw = {
  symbol: "NEE 6.219",
  stock_exchange: { mic: "NMFQS" },
  isin: "US0000000000",
};
test("validates the documented single-object response against exact trusted symbol and MIC", () => {
  expect(parseTickerMetadata(raw, "NEE 6.219", "NMFQS")).toEqual({
    symbol: "NEE 6.219",
    mic: "NMFQS",
    isin: raw.isin,
  });
  for (const value of [
    null,
    [],
    { data: raw },
    { ...raw, symbol: "NEE6.219" },
    { ...raw, symbol: "nee 6.219" },
    { ...raw, stock_exchange: null },
    { ...raw, stock_exchange: { mic: "OTHER" } },
  ])
    expect(() => parseTickerMetadata(value, "NEE 6.219", "NMFQS")).toThrow();
});
test.each([undefined, null, "", "   "])(
  "normalizes missing ISIN %s without losing validated identity",
  (isin) => {
    expect(
      parseTickerMetadata({ ...raw, isin }, raw.symbol, "NMFQS").isin,
    ).toBeNull();
  },
);
test("trims ISINs and rejects malformed or non-string identifiers", () => {
  expect(
    parseTickerMetadata({ ...raw, isin: " US0000000000 " }, raw.symbol, "NMFQS")
      .isin,
  ).toBe(raw.isin);
  for (const isin of [
    123,
    {},
    [],
    true,
    "N/A",
    "Unknown",
    "us0000000000",
    "US000000000X",
    "USA0000000000",
    "US0000 00000",
  ])
    expect(() =>
      parseTickerMetadata({ ...raw, isin }, raw.symbol, "NMFQS"),
    ).toThrow("invalid ISIN");
});
test("cache reads require the cached identity and nullable ISIN field", () => {
  expect(
    readCachedMetadata(
      { symbol: raw.symbol, mic: "NMFQS", isin: null },
      raw.symbol,
      "NMFQS",
    ).isin,
  ).toBeNull();
  expect(() =>
    readCachedMetadata(
      { symbol: raw.symbol, mic: "NMFQS" },
      raw.symbol,
      "NMFQS",
    ),
  ).toThrow();
});
