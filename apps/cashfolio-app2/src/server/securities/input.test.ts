import { describe, expect, test } from "vitest";
import { readQuery, readSelection } from "./input";
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
