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
      assetScope: "group:asset-1",
      liabilityScope: "account:liability-1",
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
      assetScope: "group:asset-1",
      liabilityScope: "account:liability-1",
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
      assetScope: "total",
      liabilityScope: "total",
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
      assetScope: undefined,
      liabilityScope: undefined,
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
    assets: "group:assets",
    liabilities: "total",
  } as const;

  test("switches metric and scope together while retaining period mode and other scopes", () => {
    const navigation = buildHistoryViewNavigation({
      mode: "year",
      selection: { metric: "assets", scope: "account:bank" },
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
      metric: "assets",
      cashFlowScope: "account:bank",
      incomeScope: "group:income",
      expenseScope: "account:expense",
      gainLossScope: "unit-type:fx",
      assetScope: "account:bank",
      liabilityScope: undefined,
      q: "keep",
    });
  });

  test.each([
    "cashFlow",
    "income",
    "expenses",
    "gainsLosses",
    "assets",
    "liabilities",
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
      assetScope: scopeSelection.assets,
      liabilityScope: scopeSelection.liabilities,
    }).search({});
    const keys = {
      cashFlow: "cashFlowScope",
      income: "incomeScope",
      expenses: "expenseScope",
      gainsLosses: "gainLossScope",
      assets: "assetScope",
      liabilities: "liabilityScope",
    } as const;
    expect(navigation.search({})).toEqual({
      ...expected,
      [keys[metric]]: undefined,
    });
    expect(scopeSelection.assets).toBe("group:assets");
  });

  test.each(["totalReturn", "savings", "netWorth"] as const)(
    "selecting %s leaves all saved scopes intact",
    (metric) => {
      const navigation = buildHistoryViewNavigation({
        mode: "year",
        selection: { metric, scope: "total" },
        scopeSelection,
      });
      expect(navigation.search({}).assetScope).toBe("group:assets");
      expect(navigation.search({}).expenseScope).toBe("account:expense");
      expect(navigation.search({}).metric).toBe(
        metric === "totalReturn" ? undefined : metric,
      );
    },
  );
});
