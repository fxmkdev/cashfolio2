import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  cleanupHistory,
  getPeriodHistory,
  loadHistoryOpeningBalancePoint,
  loadPeriodHistoryPoint,
  resetHistory,
} from "./period-history.test-support";

describe("getPeriodHistory", () => {
  beforeEach(resetHistory);
  afterEach(cleanupHistory);

  test("applies scoped Net Worth values and scoped opening balance", async () => {
    loadHistoryOpeningBalancePoint.mockResolvedValueOnce({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 150,
      liabilities: 40,
      netWorth: 110,
      scopedMetricValue: 90,
    });

    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-assets",
        granularity: "year",
        scopedMetric: "netWorth",
        netWorthScope: "group:asset-g",
      },
    });

    expect(loadPeriodHistoryPoint).toHaveBeenCalledWith({
      accountBookId: "book-assets",
      period: "2026",
      context: {
        revision: "revision",
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        netWorthScopes: [],
        hasCashAccounts: true,
      },
      metricScopeFilter: {
        metric: "netWorth",
        scope: "group:asset-g",
      },
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadHistoryOpeningBalancePoint).toHaveBeenCalledWith({
      accountBookId: "book-assets",
      accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
      referenceCurrency: "CHF",
      metricScopeFilter: {
        metric: "netWorth",
        scope: "group:asset-g",
      },
    });
    expect(result.openingBalancePoint).toEqual({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 150,
      liabilities: 40,
      netWorth: 90,
    });
    expect(result.points).toEqual([
      expect.objectContaining({
        netWorth: 24,
        liabilities: 10,
      }),
    ]);
    expect(result.scopeSelection.netWorth).toBe("group:asset-g");
  });

  test("applies scoped Gain/Loss values without opening-balance scoping", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-gains",
        granularity: "year",
        scopedMetric: "gainsLosses",
        gainLossScope: "asset-class:CASH_AND_CASH_EQUIVALENTS",
      },
    });

    expect(loadPeriodHistoryPoint).toHaveBeenCalledWith({
      accountBookId: "book-gains",
      period: "2026",
      context: {
        revision: "revision",
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        netWorthScopes: [],
        hasCashAccounts: true,
      },
      metricScopeFilter: {
        metric: "gainsLosses",
        scope: "asset-class:CASH_AND_CASH_EQUIVALENTS",
      },
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadHistoryOpeningBalancePoint).toHaveBeenCalledWith({
      accountBookId: "book-gains",
      accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
      referenceCurrency: "CHF",
      metricScopeFilter: undefined,
    });
    expect(result.points).toEqual([
      expect.objectContaining({
        gainsLosses: 24,
      }),
    ]);
    expect(result.scopeSelection.gainsLosses).toBe(
      "asset-class:CASH_AND_CASH_EQUIVALENTS",
    );
  });

  test("applies scoped cash flow values without opening-balance scoping", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-cash-flow",
        granularity: "year",
        scopedMetric: "cashFlow",
        cashFlowScope: "account:cash-a",
      },
    });

    expect(loadPeriodHistoryPoint).toHaveBeenCalledWith({
      accountBookId: "book-cash-flow",
      period: "2026",
      context: {
        revision: "revision",
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        netWorthScopes: [],
        hasCashAccounts: true,
      },
      metricScopeFilter: {
        metric: "cashFlow",
        scope: "account:cash-a",
      },
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadHistoryOpeningBalancePoint).toHaveBeenCalledWith({
      accountBookId: "book-cash-flow",
      accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
      referenceCurrency: "CHF",
      metricScopeFilter: undefined,
    });
    expect(result.points).toEqual([
      expect.objectContaining({
        cashFlow: 24,
      }),
    ]);
    expect(result.scopeSelection.cashFlow).toBe("account:cash-a");
  });

  test("falls back to total values when scoped selection is stale", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-3",
        granularity: "year",
        scopedMetric: "income",
        incomeScope: "account:missing",
        expenseScope: "total",
      },
    });

    expect(result.points).toEqual([
      expect.objectContaining({
        income: 6,
      }),
    ]);
    expect(result.scopeSelection).toEqual({
      cashFlow: "total",
      income: "total",
      expenses: "total",
      gainsLosses: "total",
      netWorth: "total",
    });
  });

  test("falls back to total cash flow when scoped cash flow selection is stale", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-cash-flow-stale",
        granularity: "year",
        scopedMetric: "cashFlow",
        cashFlowScope: "account:missing",
      },
    });

    expect(result.points).toEqual([
      expect.objectContaining({
        cashFlow: 12,
      }),
    ]);
    expect(result.scopeSelection.cashFlow).toBe("total");
  });

  test("falls back to total Net Worth when a selected account is deleted", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-4",
        granularity: "year",
        scopedMetric: "netWorth",
        netWorthScope: "account:missing",
      },
    });

    expect(result.points).toEqual([
      expect.objectContaining({
        netWorth: 11,
        liabilities: 10,
      }),
    ]);
    expect(result.scopeSelection.netWorth).toBe("total");
  });

  test("falls back to total Gain/Loss when scoped Gain/Loss selection is stale", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-5",
        granularity: "year",
        scopedMetric: "gainsLosses",
        gainLossScope: "unit-type:missing",
      },
    });

    expect(result.points).toEqual([
      expect.objectContaining({
        gainsLosses: 8,
      }),
    ]);
    expect(result.scopeSelection.gainsLosses).toBe("total");
  });
});
