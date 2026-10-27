import { describe, expect, test } from "vitest";
import {
  buildHistorySearchNavigation,
  buildHistoryViewNavigation,
} from "./-page-navigation";

describe("history page navigation", () => {
  test("uses history replace and preserves existing search params", () => {
    const navigation = buildHistorySearchNavigation({
      mode: "year",
      metric: "savings",
      cashFlowScope: "group:cash-1",
      incomeScope: "group:income-1",
      expenseScope: "account:expense-1",
      gainLossScope: "unit-type:fx",
      netWorthScope: "group:asset-1",
    });

    expect(navigation.replace).toBe(true);
    expect(
      navigation.search({
        mode: "month",
        metric: "income",
        q: "keep-me",
      }),
    ).toEqual({
      mode: "year",
      metric: "savings",
      cashFlowScope: "group:cash-1",
      incomeScope: "group:income-1",
      expenseScope: "account:expense-1",
      gainLossScope: "unit-type:fx",
      netWorthScope: "group:asset-1",
      q: "keep-me",
    });
  });

  test("clears default mode and metric values from the URL", () => {
    const navigation = buildHistorySearchNavigation({
      mode: "month",
      metric: "totalReturn",
      cashFlowScope: "total",
      incomeScope: "total",
      expenseScope: "total",
      gainLossScope: "total",
      netWorthScope: "total",
    });

    expect(
      navigation.search({
        mode: "year",
        metric: "savings",
        q: "keep-me",
      }),
    ).toEqual({
      mode: undefined,
      metric: undefined,
      cashFlowScope: undefined,
      incomeScope: undefined,
      expenseScope: undefined,
      gainLossScope: undefined,
      netWorthScope: undefined,
      q: "keep-me",
    });
  });
});

describe("unified history selection navigation", () => {
  const scopeSelection = {
    cashFlow: "account:bank",
    income: "group:income",
    expenses: "account:expense",
    gainsLosses: "unit-type:fx",
    netWorth: "group:assets",
  } as const;

  test("switches metric and scope together while retaining period mode and other scopes", () => {
    const navigation = buildHistoryViewNavigation({
      mode: "year",
      selection: { metric: "netWorth", scope: "account:bank" },
      scopeSelection,
    });
    expect(navigation.replace).toBe(true);
    expect(
      navigation.search({
        metric: "expenses",
        expenseScope: "account:expense",
        q: "keep",
      }),
    ).toEqual({
      mode: "year",
      metric: "netWorth",
      cashFlowScope: "account:bank",
      incomeScope: "group:income",
      expenseScope: "account:expense",
      gainLossScope: "unit-type:fx",
      netWorthScope: "account:bank",
      q: "keep",
    });
  });

  test.each([
    "cashFlow",
    "income",
    "expenses",
    "gainsLosses",
    "netWorth",
  ] as const)("selecting the %s root clears its scope only", (metric) => {
    const navigation = buildHistoryViewNavigation({
      mode: "month",
      selection: { metric, scope: "total" },
      scopeSelection,
    });
    const expected = buildHistorySearchNavigation({
      mode: "month",
      metric,
      cashFlowScope: scopeSelection.cashFlow,
      incomeScope: scopeSelection.income,
      expenseScope: scopeSelection.expenses,
      gainLossScope: scopeSelection.gainsLosses,
      netWorthScope: scopeSelection.netWorth,
    }).search({});
    const keys = {
      cashFlow: "cashFlowScope",
      income: "incomeScope",
      expenses: "expenseScope",
      gainsLosses: "gainLossScope",
      netWorth: "netWorthScope",
    } as const;
    expect(navigation.search({})).toEqual({
      ...expected,
      [keys[metric]]: undefined,
    });
    expect(scopeSelection.netWorth).toBe("group:assets");
  });

  test.each(["totalReturn", "savings", "assets", "liabilities"] as const)(
    "selecting %s leaves all saved scopes intact",
    (metric) => {
      const navigation = buildHistoryViewNavigation({
        mode: "year",
        selection: { metric, scope: "total" },
        scopeSelection,
      });
      expect(navigation.search({}).netWorthScope).toBe("group:assets");
      expect(navigation.search({}).expenseScope).toBe("account:expense");
      expect(navigation.search({}).metric).toBe(
        metric === "totalReturn" ? undefined : metric,
      );
    },
  );
});
