import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  cleanupHistory,
  ensureAuthorizedForAccountBookId,
  getPeriodHistory,
  loadHistoryOpeningBalancePoint,
  loadPeriodHistoryPoint,
  loadPeriodHistoryPointContext,
  resetHistory,
} from "./period-history.test-support";

describe("getPeriodHistory", () => {
  beforeEach(resetHistory);
  afterEach(cleanupHistory);

  test.each(["month", "year"] as const)(
    "preserves signed account values across zero in %s history",
    async (granularity) => {
      const option = {
        value: "account:crossing",
        label: "Crossing Account",
        kind: "account",
      };
      loadPeriodHistoryPointContext.mockResolvedValue({
        revision: "revision",
        referenceCurrency: "CHF",
        accountBookStartDate: new Date(
          granularity === "year"
            ? "2024-01-01T00:00:00Z"
            : "2026-01-01T00:00:00Z",
        ),
        holdingAccountsResolved: [],
        hasCashAccounts: true,
        netWorthScopes: [option],
      });
      const original = loadPeriodHistoryPoint.getMockImplementation()!;
      loadPeriodHistoryPoint.mockImplementation(async (args) => {
        const base = await original(args);
        const index =
          granularity === "year"
            ? Number(args.period) - 2024
            : Number(args.period.slice(-2)) - 1;
        return { ...base, scopedMetricValue: [25, 0, -10][index] };
      });
      loadHistoryOpeningBalancePoint.mockResolvedValue({
        date: "2023-12-31T00:00:00Z",
        label: "Opening Balance",
        assets: 100,
        liabilities: 25,
        netWorth: 75,
        scopedMetricValue: -5,
      });
      const result = await getPeriodHistory({
        data: {
          accountBookId: "book-1",
          granularity,
          scopedMetric: "netWorth",
          netWorthScope: "account:crossing",
        },
      });
      expect(result.scopeSelection.netWorth).toBe("account:crossing");
      expect(result.scopeOptions.netWorth).toContainEqual(option);
      expect(result.points.map((point) => point.netWorth)).toEqual([
        25, 0, -10,
      ]);
      expect(result.points.map((point) => point.assets)).toEqual(
        granularity === "year" ? [9, 9, 9] : [12, 12, 12],
      );
      expect(result.openingBalancePoint).toMatchObject({
        netWorth: -5,
        assets: 100,
        liabilities: 25,
      });
    },
  );

  test("authorizes and builds monthly points from account-book start to current month", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-1",
        granularity: "month",
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(loadPeriodHistoryPointContext).toHaveBeenCalledTimes(1);
    expect(loadPeriodHistoryPointContext).toHaveBeenCalledWith({
      accountBookId: "book-1",
    });

    expect(loadPeriodHistoryPoint).toHaveBeenCalledTimes(3);
    expect(loadHistoryOpeningBalancePoint).toHaveBeenCalledTimes(1);
    expect(loadHistoryOpeningBalancePoint).toHaveBeenCalledWith({
      accountBookId: "book-1",
      accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
      referenceCurrency: "CHF",
      metricScopeFilter: undefined,
    });
    expect(loadPeriodHistoryPoint).toHaveBeenNthCalledWith(1, {
      accountBookId: "book-1",
      period: "2026-01",
      context: {
        revision: "revision",
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        netWorthScopes: [],
        hasCashAccounts: true,
      },
      metricScopeFilter: undefined,
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadPeriodHistoryPoint).toHaveBeenNthCalledWith(2, {
      accountBookId: "book-1",
      period: "2026-02",
      context: {
        revision: "revision",
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        netWorthScopes: [],
        hasCashAccounts: true,
      },
      metricScopeFilter: undefined,
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadPeriodHistoryPoint).toHaveBeenNthCalledWith(3, {
      accountBookId: "book-1",
      period: "2026-03",
      context: {
        revision: "revision",
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        netWorthScopes: [],
        hasCashAccounts: true,
      },
      metricScopeFilter: undefined,
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    const valuationContexts = loadPeriodHistoryPoint.mock.calls.map(
      ([args]) =>
        (
          args as {
            valuationContext: { exchangeRateByKey: Map<string, unknown> };
          }
        ).valuationContext,
    );
    expect(valuationContexts[0]?.exchangeRateByKey).toBe(
      valuationContexts[1]?.exchangeRateByKey,
    );
    expect(valuationContexts[1]?.exchangeRateByKey).toBe(
      valuationContexts[2]?.exchangeRateByKey,
    );

    expect(result).toEqual({
      revision: "revision",
      referenceCurrency: "CHF",
      hasCashAccounts: true,
      openingBalancePoint: {
        date: "2026-01-04T00:00:00.000Z",
        label: "Opening Balance",
        assets: 150,
        liabilities: 40,
        netWorth: 110,
      },
      points: [
        {
          periodValue: "2026-01",
          periodLabel: "Label 2026-01",
          periodEndDate: "2026-01-31T00:00:00.000Z",
          totalReturn: 7,
          savings: 8,
          cashFlow: 15,
          income: 9,
          expenses: 10,
          gainsLosses: 11,
          assets: 12,
          liabilities: 13,
          netWorth: 14,
        },
        {
          periodValue: "2026-02",
          periodLabel: "Label 2026-02",
          periodEndDate: "2026-02-28T00:00:00.000Z",
          totalReturn: 7,
          savings: 8,
          cashFlow: 15,
          income: 9,
          expenses: 10,
          gainsLosses: 11,
          assets: 12,
          liabilities: 13,
          netWorth: 14,
        },
        {
          periodValue: "2026-03",
          periodLabel: "Label 2026-03",
          periodEndDate: "2026-03-17T00:00:00.000Z",
          totalReturn: 7,
          savings: 8,
          cashFlow: 15,
          income: 9,
          expenses: 10,
          gainsLosses: 11,
          assets: 12,
          liabilities: 13,
          netWorth: 14,
        },
      ],
      scopeOptions: {
        cashFlow: [
          { value: "total", label: "Total", kind: "total" },
          {
            value: "account:cash-a",
            label: "Cash A",
            kind: "account",
          },
        ],
        income: [
          { value: "total", label: "Total", kind: "total" },
          {
            value: "account:income-a",
            label: "Income A",
            kind: "account",
          },
        ],
        expenses: [
          { value: "total", label: "Total", kind: "total" },
          {
            value: "group:expense-g",
            label: "Expense G",
            kind: "group",
          },
        ],
        gainsLosses: [
          { value: "total", label: "Total", kind: "total" },
          {
            value: "asset-class:CASH_AND_CASH_EQUIVALENTS",
            label: "Cash & Cash Equivalents",
            kind: "gainLoss",
          },
        ],
        netWorth: [
          { value: "total", label: "Total", kind: "total" },
          {
            value: "group:asset-g",
            label: "Asset G",
            kind: "group",
          },
          {
            value: "account:liability-a",
            label: "Liability A",
            kind: "account",
          },
        ],
      },
      scopeSelection: {
        cashFlow: "total",
        income: "total",
        expenses: "total",
        gainsLosses: "total",
        netWorth: "total",
      },
    });
  });

  test("builds yearly history points for year granularity", async () => {
    await getPeriodHistory({
      data: {
        accountBookId: "book-2",
        granularity: "year",
        scopedMetric: "income",
        incomeScope: "account:income-a",
        expenseScope: "total",
      },
    });

    expect(loadPeriodHistoryPointContext).toHaveBeenCalledTimes(1);
    expect(loadPeriodHistoryPointContext).toHaveBeenCalledWith({
      accountBookId: "book-2",
    });
    expect(loadPeriodHistoryPoint).toHaveBeenCalledTimes(1);
    expect(loadHistoryOpeningBalancePoint).toHaveBeenCalledTimes(1);
    expect(loadPeriodHistoryPoint).toHaveBeenCalledWith({
      accountBookId: "book-2",
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
        metric: "income",
        scope: "account:income-a",
      },
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
  });
});
