import { describe, expect, test } from "vitest";
import {
  DEFAULT_HISTORY_SCOPE,
  DEFAULT_HISTORY_METRIC,
  DEFAULT_HISTORY_MODE,
  getHistoryMetric,
  getHistoryMode,
  getHistoryScopeForMetric,
  getHistoryScopedMetric,
  isHistoryMetric,
  isHistoryPeriodMode,
  parseHistorySearch,
} from "./-page-types";

describe("isHistoryPeriodMode", () => {
  test("accepts month and year", () => {
    expect(isHistoryPeriodMode("month")).toBe(true);
    expect(isHistoryPeriodMode("year")).toBe(true);
  });

  test("rejects unsupported values", () => {
    expect(isHistoryPeriodMode("quarter")).toBe(false);
    expect(isHistoryPeriodMode(undefined)).toBe(false);
  });
});

describe("isHistoryMetric", () => {
  test("accepts supported metric values", () => {
    expect(isHistoryMetric("totalReturn")).toBe(true);
    expect(isHistoryMetric("savings")).toBe(true);
    expect(isHistoryMetric("cashFlow")).toBe(true);
    expect(isHistoryMetric("income")).toBe(true);
    expect(isHistoryMetric("expenses")).toBe(true);
    expect(isHistoryMetric("gainsLosses")).toBe(true);
    expect(isHistoryMetric("assets")).toBe(true);
    expect(isHistoryMetric("liabilities")).toBe(true);
    expect(isHistoryMetric("netWorth")).toBe(true);
  });

  test("rejects unsupported values", () => {
    expect(isHistoryMetric("cashflow")).toBe(false);
    expect(isHistoryMetric(undefined)).toBe(false);
  });
});

describe("parseHistorySearch", () => {
  test.each([
    ["assets", "assetScope"],
    ["liabilities", "liabilityScope"],
  ])("moves a legacy %s selection to Net Worth", (metric, key) => {
    expect(
      parseHistorySearch({ metric, [key]: "account:bank", mode: "year" }),
    ).toEqual({
      metric: "netWorth",
      netWorthScope: "account:bank",
      mode: "year",
    });
    expect(
      parseHistorySearch({
        metric,
        [key]: "group:banking",
        netWorthScope: "account:other",
      }),
    ).toEqual({
      metric: "netWorth",
      netWorthScope: "account:other",
    });
    expect(parseHistorySearch({ metric, [key]: "total" })).toEqual({ metric });
    expect(parseHistorySearch({ metric, [key]: "bad" })).toEqual({
      metric: "netWorth",
      netWorthScope: undefined,
    });
  });

  test("discards inactive legacy scopes without changing the selected metric", () => {
    expect(
      parseHistorySearch({
        metric: "income",
        assetScope: "account:bank",
        liabilityScope: "group:cards",
      }),
    ).toEqual({ metric: "income" });
  });
  test("keeps validated search shape minimal when keys are absent", () => {
    const result = parseHistorySearch({ mode: "month" });
    expect(result).toEqual({ mode: "month" });
    expect("metric" in result).toBe(false);
    expect("cashFlowScope" in result).toBe(false);
    expect("incomeScope" in result).toBe(false);
    expect("expenseScope" in result).toBe(false);
    expect("gainLossScope" in result).toBe(false);
    expect("netWorthScope" in result).toBe(false);
  });

  test("keeps valid mode values", () => {
    expect(parseHistorySearch({ mode: "month" })).toEqual({ mode: "month" });
    expect(parseHistorySearch({ mode: "year" })).toEqual({ mode: "year" });
  });

  test("keeps valid metric values", () => {
    expect(parseHistorySearch({ metric: "totalReturn" })).toEqual({
      metric: "totalReturn",
    });
    expect(parseHistorySearch({ metric: "savings" })).toEqual({
      metric: "savings",
    });
    expect(parseHistorySearch({ metric: "cashFlow" })).toEqual({
      metric: "cashFlow",
    });
    expect(parseHistorySearch({ metric: "income" })).toEqual({
      metric: "income",
    });
    expect(parseHistorySearch({ metric: "expenses" })).toEqual({
      metric: "expenses",
    });
    expect(parseHistorySearch({ metric: "gainsLosses" })).toEqual({
      metric: "gainsLosses",
    });
    expect(parseHistorySearch({ metric: "assets" })).toEqual({
      metric: "assets",
    });
    expect(parseHistorySearch({ metric: "liabilities" })).toEqual({
      metric: "liabilities",
    });
    expect(parseHistorySearch({ metric: "netWorth" })).toEqual({
      metric: "netWorth",
    });
  });

  test("keeps valid scope values", () => {
    expect(parseHistorySearch({ incomeScope: "total" })).toEqual({
      incomeScope: "total",
    });
    expect(parseHistorySearch({ cashFlowScope: "group:cash" })).toEqual({
      cashFlowScope: "group:cash",
    });
    expect(parseHistorySearch({ incomeScope: "group:g-1" })).toEqual({
      incomeScope: "group:g-1",
    });
    expect(parseHistorySearch({ expenseScope: "account:a-1" })).toEqual({
      expenseScope: "account:a-1",
    });
    expect(parseHistorySearch({ netWorthScope: "group:assets" })).toEqual({
      netWorthScope: "group:assets",
    });
    expect(
      parseHistorySearch({ netWorthScope: "account:liability-1" }),
    ).toEqual({
      netWorthScope: "account:liability-1",
    });
    expect(parseHistorySearch({ gainLossScope: "unit-type:fx" })).toEqual({
      gainLossScope: "unit-type:fx",
    });
    expect(parseHistorySearch({ gainLossScope: "unit:fx:USD" })).toEqual({
      gainLossScope: "unit:fx:USD",
    });
    expect(
      parseHistorySearch({ gainLossScope: "unit-account:fx:USD:cash-1" }),
    ).toEqual({
      gainLossScope: "unit-account:fx:USD:cash-1",
    });
    expect(
      parseHistorySearch({ gainLossScope: "explicit-account:cash-1" }),
    ).toEqual({
      gainLossScope: "explicit-account:cash-1",
    });
  });

  test("drops invalid mode values", () => {
    expect(parseHistorySearch({ mode: "weekly" })).toEqual({
      mode: undefined,
    });
    expect(parseHistorySearch({ mode: "quarter" })).toEqual({
      mode: undefined,
    });
  });

  test("drops invalid metric values", () => {
    expect(parseHistorySearch({ metric: "cashflow" })).toEqual({
      metric: undefined,
    });
  });

  test("drops invalid scope values", () => {
    expect(parseHistorySearch({ incomeScope: "group:" })).toEqual({
      incomeScope: undefined,
    });
    expect(parseHistorySearch({ cashFlowScope: "account:" })).toEqual({
      cashFlowScope: undefined,
    });
    expect(parseHistorySearch({ expenseScope: "invalid" })).toEqual({
      expenseScope: undefined,
    });
    expect(parseHistorySearch({ netWorthScope: "account:" })).toEqual({
      netWorthScope: undefined,
    });
    expect(parseHistorySearch({ netWorthScope: "wat" })).toEqual({
      netWorthScope: undefined,
    });
    expect(parseHistorySearch({ gainLossScope: "unit:" })).toEqual({
      gainLossScope: undefined,
    });
  });
});

describe("getHistoryMode", () => {
  test("returns explicit mode when present", () => {
    expect(getHistoryMode({ mode: "year" })).toBe("year");
  });

  test("falls back to default mode", () => {
    expect(getHistoryMode({})).toBe(DEFAULT_HISTORY_MODE);
  });
});

describe("getHistoryMetric", () => {
  test("returns explicit metric when present", () => {
    expect(getHistoryMetric({ metric: "income" })).toBe("income");
  });

  test("falls back to default metric", () => {
    expect(getHistoryMetric({})).toBe(DEFAULT_HISTORY_METRIC);
  });
});

describe("getHistoryScopeForMetric", () => {
  test("returns explicit metric scope when present", () => {
    expect(
      getHistoryScopeForMetric({
        metric: "cashFlow",
        search: { cashFlowScope: "account:cash-1" },
      }),
    ).toBe("account:cash-1");
    expect(
      getHistoryScopeForMetric({
        metric: "income",
        search: { incomeScope: "account:income-1" },
      }),
    ).toBe("account:income-1");
    expect(
      getHistoryScopeForMetric({
        metric: "expenses",
        search: { expenseScope: "group:expense-group" },
      }),
    ).toBe("group:expense-group");
    expect(
      getHistoryScopeForMetric({
        metric: "gainsLosses",
        search: { gainLossScope: "unit-type:fx" },
      }),
    ).toBe("unit-type:fx");
    expect(
      getHistoryScopeForMetric({
        metric: "netWorth",
        search: { netWorthScope: "group:asset-group" },
      }),
    ).toBe("group:asset-group");
    expect(
      getHistoryScopeForMetric({
        metric: "netWorth",
        search: { netWorthScope: "account:liability-1" },
      }),
    ).toBe("account:liability-1");
  });

  test("falls back to default history scope", () => {
    expect(
      getHistoryScopeForMetric({
        metric: "income",
        search: {},
      }),
    ).toBe(DEFAULT_HISTORY_SCOPE);
  });
});

describe("getHistoryScopedMetric", () => {
  test("returns scoped metrics only", () => {
    expect(getHistoryScopedMetric("cashFlow")).toBe("cashFlow");
    expect(getHistoryScopedMetric("income")).toBe("income");
    expect(getHistoryScopedMetric("expenses")).toBe("expenses");
    expect(getHistoryScopedMetric("gainsLosses")).toBe("gainsLosses");
    expect(getHistoryScopedMetric("assets")).toBeUndefined();
    expect(getHistoryScopedMetric("liabilities")).toBeUndefined();
    expect(getHistoryScopedMetric("netWorth")).toBe("netWorth");
  });
});
