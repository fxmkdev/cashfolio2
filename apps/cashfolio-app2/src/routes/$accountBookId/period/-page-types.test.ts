import { describe, expect, test } from "vitest";
import {
  DEFAULT_PERIOD_VALUE,
  formatBreakdownPathSearchValue,
  getBreakdownPathByType,
  getPeriodValue,
  isPeriodSearchValue,
  parseBreakdownPathSearchValue,
  parsePeriodSearch,
} from "./-page-types";

describe("isPeriodSearchValue", () => {
  test("accepts preset values", () => {
    expect(isPeriodSearchValue("mtd")).toBe(true);
    expect(isPeriodSearchValue("ytd")).toBe(true);
    expect(isPeriodSearchValue("last-month")).toBe(true);
    expect(isPeriodSearchValue("last-year")).toBe(true);
  });

  test("accepts explicit month and year values", () => {
    expect(isPeriodSearchValue("2026-01")).toBe(true);
    expect(isPeriodSearchValue("2026")).toBe(true);
  });

  test("rejects invalid values", () => {
    expect(isPeriodSearchValue("0099")).toBe(false);
    expect(isPeriodSearchValue("0100")).toBe(false);
    expect(isPeriodSearchValue("0099-01")).toBe(false);
    expect(isPeriodSearchValue("0100-01")).toBe(false);
    expect(isPeriodSearchValue("2026-13")).toBe(false);
    expect(isPeriodSearchValue("2026-00")).toBe(false);
    expect(isPeriodSearchValue("bad")).toBe(false);
    expect(isPeriodSearchValue(123)).toBe(false);
  });
});

describe("parsePeriodSearch", () => {
  test("keeps valid period values", () => {
    expect(parsePeriodSearch({ period: "ytd" })).toEqual({
      period: "ytd",
      expensePath: undefined,
      incomePath: undefined,
    });
    expect(parsePeriodSearch({ period: "2026-02" })).toEqual({
      period: "2026-02",
      expensePath: undefined,
      incomePath: undefined,
    });
  });

  test("normalizes case and trims whitespace", () => {
    expect(parsePeriodSearch({ period: "  LAST-MONTH " })).toEqual({
      period: "last-month",
      expensePath: undefined,
      incomePath: undefined,
    });
  });

  test("normalizes drill paths", () => {
    expect(
      parsePeriodSearch({
        period: "2026-02",
        expensePath: " group:a ,, group:b ",
        incomePath: "group:i1,group:i2",
      }),
    ).toEqual({
      period: "2026-02",
      expensePath: "group:a,group:b",
      incomePath: "group:i1,group:i2",
    });
  });

  test("drops invalid values", () => {
    expect(parsePeriodSearch({ period: "unexpected" })).toEqual({
      period: undefined,
      expensePath: undefined,
      incomePath: undefined,
    });
  });
});

describe("getPeriodValue", () => {
  test("falls back to default when search period is missing", () => {
    expect(getPeriodValue(parsePeriodSearch({}))).toBe(DEFAULT_PERIOD_VALUE);
  });

  test("returns provided value when valid", () => {
    expect(getPeriodValue(parsePeriodSearch({ period: "2026" }))).toBe("2026");
  });
});

describe("breakdown path helpers", () => {
  test("parses and formats drill path values", () => {
    expect(parseBreakdownPathSearchValue(undefined)).toEqual([]);
    expect(parseBreakdownPathSearchValue("group:a,group:b")).toEqual([
      "group:a",
      "group:b",
    ]);
    expect(formatBreakdownPathSearchValue([])).toBe(undefined);
    expect(formatBreakdownPathSearchValue(["group:a", "group:b"])).toBe(
      "group:a,group:b",
    );
  });

  test("extracts drill paths by breakdown type", () => {
    expect(
      getBreakdownPathByType(
        parsePeriodSearch({
          expensePath: "group:e1,group:e2",
          incomePath: "group:i1",
        }),
      ),
    ).toEqual({
      expense: ["group:e1", "group:e2"],
      income: ["group:i1"],
    });
  });
});
