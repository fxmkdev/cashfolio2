import { describe, expect, test } from "vitest";
import {
  DEFAULT_TIMELINE_SCOPE,
  DEFAULT_TIMELINE_METRIC,
  DEFAULT_TIMELINE_MODE,
  getTimelineMetric,
  getTimelineMode,
  getTimelineScopeForMetric,
  getTimelineScopedMetric,
  isTimelineMetric,
  isTimelinePeriodMode,
  parseTimelineSearch,
} from "./-page-types";

describe("isTimelinePeriodMode", () => {
  test("accepts month and year", () => {
    expect(isTimelinePeriodMode("month")).toBe(true);
    expect(isTimelinePeriodMode("year")).toBe(true);
  });

  test("rejects unsupported values", () => {
    expect(isTimelinePeriodMode("quarter")).toBe(false);
    expect(isTimelinePeriodMode(undefined)).toBe(false);
  });
});

describe("isTimelineMetric", () => {
  test("accepts supported metric values", () => {
    expect(isTimelineMetric("totalReturn")).toBe(true);
    expect(isTimelineMetric("savings")).toBe(true);
    expect(isTimelineMetric("income")).toBe(true);
    expect(isTimelineMetric("expenses")).toBe(true);
    expect(isTimelineMetric("gainsLosses")).toBe(true);
    expect(isTimelineMetric("assets")).toBe(true);
    expect(isTimelineMetric("liabilities")).toBe(true);
    expect(isTimelineMetric("netWorth")).toBe(true);
  });

  test("rejects unsupported values", () => {
    expect(isTimelineMetric("cashflow")).toBe(false);
    expect(isTimelineMetric(undefined)).toBe(false);
  });
});

describe("parseTimelineSearch", () => {
  test("keeps validated search shape minimal when keys are absent", () => {
    const result = parseTimelineSearch({ mode: "month" });
    expect(result).toEqual({ mode: "month" });
    expect("metric" in result).toBe(false);
    expect("incomeScope" in result).toBe(false);
    expect("expenseScope" in result).toBe(false);
  });

  test("keeps valid mode values", () => {
    expect(parseTimelineSearch({ mode: "month" })).toEqual({ mode: "month" });
    expect(parseTimelineSearch({ mode: "year" })).toEqual({ mode: "year" });
  });

  test("keeps valid metric values", () => {
    expect(parseTimelineSearch({ metric: "totalReturn" })).toEqual({
      metric: "totalReturn",
    });
    expect(parseTimelineSearch({ metric: "savings" })).toEqual({
      metric: "savings",
    });
    expect(parseTimelineSearch({ metric: "income" })).toEqual({
      metric: "income",
    });
    expect(parseTimelineSearch({ metric: "expenses" })).toEqual({
      metric: "expenses",
    });
    expect(parseTimelineSearch({ metric: "gainsLosses" })).toEqual({
      metric: "gainsLosses",
    });
    expect(parseTimelineSearch({ metric: "assets" })).toEqual({
      metric: "assets",
    });
    expect(parseTimelineSearch({ metric: "liabilities" })).toEqual({
      metric: "liabilities",
    });
    expect(parseTimelineSearch({ metric: "netWorth" })).toEqual({
      metric: "netWorth",
    });
  });

  test("keeps valid scope values", () => {
    expect(parseTimelineSearch({ incomeScope: "total" })).toEqual({
      incomeScope: "total",
    });
    expect(parseTimelineSearch({ incomeScope: "group:g-1" })).toEqual({
      incomeScope: "group:g-1",
    });
    expect(parseTimelineSearch({ expenseScope: "account:a-1" })).toEqual({
      expenseScope: "account:a-1",
    });
  });

  test("drops invalid mode values", () => {
    expect(parseTimelineSearch({ mode: "weekly" })).toEqual({
      mode: undefined,
    });
    expect(parseTimelineSearch({ mode: "quarter" })).toEqual({
      mode: undefined,
    });
  });

  test("drops invalid metric values", () => {
    expect(parseTimelineSearch({ metric: "cashflow" })).toEqual({
      metric: undefined,
    });
  });

  test("drops invalid scope values", () => {
    expect(parseTimelineSearch({ incomeScope: "group:" })).toEqual({
      incomeScope: undefined,
    });
    expect(parseTimelineSearch({ expenseScope: "invalid" })).toEqual({
      expenseScope: undefined,
    });
  });
});

describe("getTimelineMode", () => {
  test("returns explicit mode when present", () => {
    expect(getTimelineMode({ mode: "year" })).toBe("year");
  });

  test("falls back to default mode", () => {
    expect(getTimelineMode({})).toBe(DEFAULT_TIMELINE_MODE);
  });
});

describe("getTimelineMetric", () => {
  test("returns explicit metric when present", () => {
    expect(getTimelineMetric({ metric: "income" })).toBe("income");
  });

  test("falls back to default metric", () => {
    expect(getTimelineMetric({})).toBe(DEFAULT_TIMELINE_METRIC);
  });
});

describe("getTimelineScopeForMetric", () => {
  test("returns explicit metric scope when present", () => {
    expect(
      getTimelineScopeForMetric({
        metric: "income",
        search: { incomeScope: "account:income-1" },
      }),
    ).toBe("account:income-1");
    expect(
      getTimelineScopeForMetric({
        metric: "expenses",
        search: { expenseScope: "group:expense-group" },
      }),
    ).toBe("group:expense-group");
  });

  test("falls back to default timeline scope", () => {
    expect(
      getTimelineScopeForMetric({
        metric: "income",
        search: {},
      }),
    ).toBe(DEFAULT_TIMELINE_SCOPE);
  });
});

describe("getTimelineScopedMetric", () => {
  test("returns scoped metric for income/expenses only", () => {
    expect(getTimelineScopedMetric("income")).toBe("income");
    expect(getTimelineScopedMetric("expenses")).toBe("expenses");
    expect(getTimelineScopedMetric("assets")).toBeUndefined();
  });
});
