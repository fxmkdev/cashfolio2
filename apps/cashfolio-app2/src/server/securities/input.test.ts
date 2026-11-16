import { describe, expect, test } from "vitest";
import { readQuery, readScope, readSelection } from "./input";
import { queryWhere } from "./store.server";
const base = {
  version: "snapshot",
  criteria: { query: "  abc  ", exchange: null },
  offset: 0,
  limit: 20,
  filters: {},
  sorts: [],
};
describe("Securities input and query boundaries", () => {
  test("selected listings need only stored identity and snapshot version", () => {
    expect(readSelection({ id: "listing", version: "version" })).toEqual({
      id: "listing",
      version: "version",
    });
    expect(() =>
      readScope({
        version: "v",
        criteria: { query: "", exchange: "bad code" },
      }),
    ).toThrow("identifier");
  });
  test("accepts exact Marketstack identifiers that are not four-character ISO MICs", () => {
    for (const exchange of ["XETRA", "NMFQS", "XNAS"])
      expect(
        readScope({ version: "v", criteria: { query: "", exchange } }).criteria
          .exchange,
      ).toBe(exchange);
    for (const exchange of ["XNYS,XNAS", "X".repeat(65), "bad code"])
      expect(() =>
        readScope({ version: "v", criteria: { query: "", exchange } }),
      ).toThrow();
  });
  test("trims queries and keeps only whitelisted fields", () => {
    const query = readQuery({
      ...base,
      filters: { sql: "DROP", country: ["Unknown", "Unknown"] },
      sorts: [{ field: "exchange", direction: "desc" }],
    });
    expect(query.criteria.query).toBe("abc");
    expect(query.filters).toEqual({ country: ["Unknown"] });
    expect(queryWhere(query)).toMatchObject({
      AND: [
        {
          snapshotId: "snapshot",
          OR: [
            { name: { contains: "abc", mode: "insensitive" } },
            { symbol: { contains: "abc", mode: "insensitive" } },
          ],
        },
        { OR: [{ country: { in: [] } }, { country: null }] },
      ],
    });
  });
  test("validates page size, offsets, sort fields and all filter types", () => {
    for (const input of [
      { ...base, limit: 1000 },
      { ...base, offset: -1 },
      { ...base, offset: 1.2 },
      { ...base, sorts: [{ field: "snapshotId", direction: "asc" }] },
      { ...base, filters: { hasHistory: ["Maybe"] } },
      { ...base, filters: { name: { operation: "rawSQL", value: "x" } } },
      { ...base, filters: { exchange: "NASDAQ" } },
    ])
      expect(() => readQuery(input)).toThrow();
    expect(() =>
      readScope({ ...base, criteria: { query: "x".repeat(256) } }),
    ).toThrow();
    expect(() => readSelection({ version: "", id: "x" })).toThrow();
  });
  test("combines text, exchange, country and availability predicates", () => {
    expect(
      queryWhere(
        readQuery({
          ...base,
          filters: {
            name: { operation: "notContains", value: "Fund" },
            symbol: { operation: "startsWith", value: "AB" },
            exchange: ["NASDAQ (XNAS)"],
            country: ["US"],
            hasHistory: ["Unknown", "Unavailable"],
          },
        }),
      ).AND,
    ).toEqual(
      expect.arrayContaining([
        { NOT: { name: { contains: "Fund", mode: "insensitive" } } },
        { symbol: { startsWith: "AB", mode: "insensitive" } },
        { exchangeLabel: { in: ["NASDAQ (XNAS)"] } },
        { OR: [{ hasHistory: null }, { hasHistory: false }] },
      ]),
    );
  });
});
