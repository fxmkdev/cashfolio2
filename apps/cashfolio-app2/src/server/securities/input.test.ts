import { describe, expect, test } from "vitest";
import {
  readQuery,
  readSelection,
  readIdentity,
  readExchangePreference,
} from "./input";
const base = {
  criteria: { query: "  abc  ", exchange: null },
  offset: 0,
  limit: 20,
};
describe("Securities input boundaries", () => {
  test("trims search text and preserves provider exchange identifiers", () => {
    expect(readQuery(base).criteria.query).toBe("abc");
    for (const exchange of ["XETRA", "NMFQS", "XNAS"])
      expect(
        readQuery({ ...base, criteria: { query: "", exchange } }).criteria
          .exchange,
      ).toBe(exchange);
    expect(readSelection({ selectionToken: "reference" })).toEqual({
      selectionToken: "reference",
    });
  });
  test("rejects unsupported options and invalid text, exchanges, pagination and references", () => {
    for (const input of [
      null,
      { ...base, limit: 1000 },
      { ...base, offset: -1 },
      { ...base, offset: 1.2 },
      { ...base, offset: 1 },
      { ...base, offset: 2147483648 },
      { ...base, sorts: [] },
      { ...base, filters: {} },
      { ...base, version: "old" },
      { ...base, criteria: { query: "x".repeat(256), exchange: null } },
      ...["XNYS,XNAS", "X".repeat(65), "bad code", 4].map((exchange) => ({
        ...base,
        criteria: { query: "", exchange },
      })),
    ])
      expect(() => readQuery(input)).toThrow();
    for (const input of [
      {},
      { selectionToken: "" },
      { selectionToken: "x".repeat(4097) },
      { id: "old", version: "old" },
    ])
      expect(() => readSelection(input)).toThrow();
  });
});

test("restoration validates exact bounded symbol/MIC and rejects caller metadata", () => {
  expect(readIdentity({ symbol: " BRK B ", mic: "XNYS" })).toEqual({
    symbol: " BRK B ",
    mic: "XNYS",
  });
  expect(readIdentity({ symbol: "A", mic: null })).toEqual({
    symbol: "A",
    mic: null,
  });
  for (const value of [
    { symbol: "A,B", mic: null },
    { symbol: "A", mic: "../X" },
    { symbol: "A", mic: null, name: "Forged" },
    { symbol: " ", mic: null },
    { symbol: "A".repeat(65), mic: null },
  ])
    expect(() => readIdentity(value)).toThrow("Invalid security identity");
});
test("preference writes accept only the exact bounded nullable MIC, never a caller user ID", () => {
  expect(readExchangePreference({ exchange: "XNAS" })).toEqual({
    exchange: "XNAS",
  });
  expect(readExchangePreference({ exchange: null })).toEqual({
    exchange: null,
  });
  for (const value of [
    { exchange: " XNAS " },
    { exchange: "" },
    { exchange: "X".repeat(65) },
    { exchange: "XNAS", userId: "other" },
    {},
  ])
    expect(() => readExchangePreference(value)).toThrow(
      "Invalid securities exchange preference",
    );
});
