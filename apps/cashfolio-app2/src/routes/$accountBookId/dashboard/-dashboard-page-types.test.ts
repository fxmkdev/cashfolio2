import { describe, expect, test } from "vitest";
import {
  getDashboardPeriod,
  parseDashboardSearch,
} from "./-dashboard-page-types";

describe("parseDashboardSearch", () => {
  test("returns 12m for valid period 12m", () => {
    expect(parseDashboardSearch({ period: "12m" })).toEqual({
      period: "12m",
    });
  });

  test("returns 10y for valid period 10y", () => {
    expect(parseDashboardSearch({ period: "10y" })).toEqual({
      period: "10y",
    });
  });

  test("returns undefined period when period is missing", () => {
    expect(parseDashboardSearch({})).toEqual({ period: undefined });
  });

  test("returns undefined period when period is invalid", () => {
    expect(parseDashboardSearch({ period: "unexpected" })).toEqual({
      period: undefined,
    });
  });
});

describe("getDashboardPeriod", () => {
  test("falls back to 12m when period is missing", () => {
    expect(getDashboardPeriod(parseDashboardSearch({}))).toBe("12m");
  });

  test("falls back to 12m when period is invalid", () => {
    expect(
      getDashboardPeriod(parseDashboardSearch({ period: "unexpected" })),
    ).toBe("12m");
  });
});
