import { describe, expect, test } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  buildHistoryLegacySearchNavigation,
  buildHistorySearchNavigation,
  buildHistoryViewNavigation,
  buildHistoryScopeNormalization,
} from "./-page-navigation";
import { parseHistorySearch } from "./-page-types";

describe("legacy History URL canonicalization", () => {
  test.each([
    ["metric=assets&assetScope=account:bank", "netWorth", "account:bank"],
    [
      "metric=liabilities&liabilityScope=group:cards",
      "netWorth",
      "group:cards",
    ],
    [
      "metric=assets&assetScope=total&liabilityScope=account:bank",
      "assets",
      null,
    ],
    ["metric=income&liabilityScope=account:bank", "income", null],
    [
      "metric=assets&assetScope=account:bank&netWorthScope=group:cards",
      "netWorth",
      "group:cards",
    ],
  ])(
    "removes legacy keys from %s without redirecting again",
    (query, metric, scope) => {
      const root = createRootRoute();
      const historyRoute = createRoute({
        getParentRoute: () => root,
        path: "/$accountBookId/history",
        validateSearch: parseHistorySearch,
      });
      const router = createRouter({
        routeTree: root.addChildren([historyRoute]),
        history: createMemoryHistory({
          initialEntries: [`/book/history?mode=year&${query}`],
        }),
      });
      const navigation = buildHistoryLegacySearchNavigation(
        router.latestLocation.search,
      )!;
      expect(navigation.replace).toBe(true);
      const location = router.buildLocation({
        to: "/$accountBookId/history",
        params: { accountBookId: "book" },
        ...navigation,
      });
      const url = new URL(location.href, "https://cashfolio.test");
      expect(url.searchParams.get("metric")).toBe(metric);
      expect(url.searchParams.get("mode")).toBe("year");
      expect(url.searchParams.get("netWorthScope")).toBe(scope);
      expect(url.searchParams.has("assetScope")).toBe(false);
      expect(url.searchParams.has("liabilityScope")).toBe(false);
      expect(
        buildHistoryLegacySearchNavigation(location.search),
      ).toBeUndefined();
    },
  );
});

describe("history page navigation", () => {
  test("normalizes merged scopes before making History interactive", () => {
    const search = {
      metric: "gainsLosses" as const,
      gainLossScope: "explicit-account:cash" as const,
    };
    const scopeSelection = {
      cashFlow: "total" as const,
      income: "total" as const,
      expenses: "total" as const,
      gainsLosses: "gain-loss-account:cash" as const,
      netWorth: "total" as const,
    };
    const navigation = buildHistoryScopeNormalization({
      search,
      scopeSelection,
    });
    expect(navigation?.replace).toBe(true);
    const normalized = navigation!.search(search);
    expect(normalized.gainLossScope).toBe("gain-loss-account:cash");
    expect(
      buildHistoryScopeNormalization({ search: normalized, scopeSelection }),
    ).toBeUndefined();
  });

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
