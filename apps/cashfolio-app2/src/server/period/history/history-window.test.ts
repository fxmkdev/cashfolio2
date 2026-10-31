import { describe, expect, it } from "vitest";
import { getHistoryWindow } from "./history-window";
const range = {
  minDate: new Date("1800-03-15Z"),
  maxDate: new Date("2026-10-28Z"),
};
describe("bounded History windows", () => {
  it("uses UTC calendar periods across local year boundaries", () => {
    expect(
      getHistoryWindow({
        granularity: "month",
        minDate: new Date("2025-12-31T23:30:00-02:00"),
        maxDate: new Date("2026-02-01T00:30:00+02:00"),
      }),
    ).toEqual({ values: ["2026-01"], nextBefore: undefined });
  });

  it("returns no periods for a cursor at the book's beginning", () => {
    expect(
      getHistoryWindow({
        ...range,
        granularity: "month",
        before: "1800-03",
      }),
    ).toEqual({ values: [], nextBefore: undefined });
  });

  it("walks centuries of monthly history without gaps, duplicates, or oversized requests", () => {
    let before: string | undefined;
    const values: string[] = [];
    do {
      const page = getHistoryWindow({ ...range, granularity: "month", before });
      expect(page.values.length).toBeLessThanOrEqual(120);
      values.unshift(...page.values);
      before = page.nextBefore;
    } while (before);
    expect(values[0]).toBe("1800-03");
    expect(values.at(-1)).toBe("2026-10");
    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBe((2026 - 1800) * 12 + 8);
  });
  it("bounds yearly history and uses an exclusive cursor", () => {
    const page = getHistoryWindow({
      ...range,
      granularity: "year",
      pageSize: 100,
    });
    expect(page.values).toHaveLength(100);
    expect(page.nextBefore).toBe("1927");
    expect(
      getHistoryWindow({
        ...range,
        granularity: "year",
        before: page.nextBefore,
      }).values.at(-1),
    ).toBe("1926");
  });
  it.each(["month", "year"] as const)(
    "defaults to a small %s window",
    (granularity) => {
      const page = getHistoryWindow({ ...range, granularity });
      expect(page.values).toHaveLength(granularity === "month" ? 12 : 5);
      expect(page.nextBefore).toBe(page.values[0]);
    },
  );
  it("supports changing page sizes without gaps or duplicates", () => {
    let before: string | undefined;
    const values: string[] = [];
    let count = 0;
    do {
      const page = getHistoryWindow({
        ...range,
        granularity: "month",
        before,
        pageSize: [1, 6, 120][count++ % 3],
      });
      values.unshift(...page.values);
      before = page.nextBefore;
    } while (before);
    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBe((2026 - 1800) * 12 + 8);
  });
  it.each([0, -1, 1.5, NaN, Infinity, "12", null, 121])(
    "rejects invalid size %s",
    (pageSize) => {
      expect(() =>
        getHistoryWindow({
          ...range,
          granularity: "month",
          pageSize: pageSize as number,
        }),
      ).toThrow("window size");
    },
  );
  it("enforces the yearly maximum", () => {
    expect(() =>
      getHistoryWindow({ ...range, granularity: "year", pageSize: 101 }),
    ).toThrow("100");
  });
  it.each(["2026-13", "2027-01", "2026", "2026-1", "2026-01-01"])(
    "rejects invalid monthly cursor %s",
    (before) => {
      expect(() =>
        getHistoryWindow({ ...range, granularity: "month", before }),
      ).toThrow();
    },
  );
  it("returns no earlier cursor for an empty window", () => {
    expect(
      getHistoryWindow({ ...range, granularity: "month", before: "1800-03" }),
    ).toEqual({ values: [], nextBefore: undefined });
  });
});
