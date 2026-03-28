import { describe, expect, test } from "vitest";
import {
  DEFAULT_PERIOD_VALUE,
  getPeriodValue,
  isPeriodSearchValue,
  parsePeriodSearch,
} from "./-period-page-types";

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
    expect(isPeriodSearchValue("2026-13")).toBe(false);
    expect(isPeriodSearchValue("2026-00")).toBe(false);
    expect(isPeriodSearchValue("bad")).toBe(false);
    expect(isPeriodSearchValue(123)).toBe(false);
  });
});

describe("parsePeriodSearch", () => {
  test("keeps valid period values", () => {
    expect(parsePeriodSearch({ period: "ytd" })).toEqual({ period: "ytd" });
    expect(parsePeriodSearch({ period: "2026-02" })).toEqual({
      period: "2026-02",
    });
  });

  test("normalizes case and trims whitespace", () => {
    expect(parsePeriodSearch({ period: "  LAST-MONTH " })).toEqual({
      period: "last-month",
    });
  });

  test("drops invalid values", () => {
    expect(parsePeriodSearch({ period: "unexpected" })).toEqual({
      period: undefined,
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
