import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      validator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async ({ data }: { data: unknown }) => {
          const validatedData = validate ? validate(data) : data;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const loadPeriodHistoryPoint = vi.hoisted(() => vi.fn());
const loadPeriodHistoryPointContext = vi.hoisted(() => vi.fn());
const loadHistoryOpeningBalancePoint = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("./period-history-point.server", () => ({
  loadPeriodHistoryPoint,
  loadPeriodHistoryPointContext,
}));

vi.mock("./period-history-opening-balance.server", () => ({
  loadHistoryOpeningBalancePoint,
}));

import { buildHistoryPeriodValues, getPeriodHistory } from "./period-history";

describe("buildHistoryPeriodValues", () => {
  test("builds monthly values from account-book start month to current month", () => {
    expect(
      buildHistoryPeriodValues({
        granularity: "month",
        minDate: new Date("2024-11-19T10:15:00.000Z"),
        maxDate: new Date("2025-03-02T21:30:00.000Z"),
      }),
    ).toEqual(["2024-11", "2024-12", "2025-01", "2025-02", "2025-03"]);
  });

  test("builds yearly values from account-book start year to current year", () => {
    expect(
      buildHistoryPeriodValues({
        granularity: "year",
        minDate: new Date("2022-07-01T00:00:00.000Z"),
        maxDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  test("returns empty values for inverted ranges", () => {
    expect(
      buildHistoryPeriodValues({
        granularity: "month",
        minDate: new Date("2026-05-01T00:00:00.000Z"),
        maxDate: new Date("2026-04-01T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});

describe("getPeriodHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:00.000Z"));

    loadPeriodHistoryPointContext.mockResolvedValue({
      referenceCurrency: "CHF",
      accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
      holdingAccountsResolved: [],
      netWorthScopes: [],
      hasCashAccounts: true,
    });
    loadHistoryOpeningBalancePoint.mockResolvedValue({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 150,
      liabilities: 40,
      netWorth: 110,
    });

    loadPeriodHistoryPoint.mockImplementation(
      async ({ period }: { period: string; accountBookId: string }) => ({
        selectedPeriodValue: period,
        selectedPeriodLabel: `Label ${period}`,
        selectedPeriodEnd:
          period === "2026-03"
            ? new Date("2026-03-17T00:00:00.000Z")
            : period === "2026-02"
              ? new Date("2026-02-28T00:00:00.000Z")
              : new Date("2026-01-31T00:00:00.000Z"),
        totalReturn: period.length,
        savings: period.length + 1,
        cashFlow: period.length + 8,
        income: period.length + 2,
        expenses: period.length + 3,
        gainsLosses: period.length + 4,
        assets: period.length + 5,
        liabilities: period.length + 6,
        netWorth: period.length + 7,
        scopeOptions: {
          cashFlow: [
            {
              value: "account:cash-a",
              label: "Cash A",
              kind: "account",
            },
          ],
          income: [
            {
              value: "account:income-a",
              label: "Income A",
              kind: "account",
            },
          ],
          expenses: [
            {
              value: "group:expense-g",
              label: "Expense G",
              kind: "group",
            },
          ],
          gainsLosses: [
            {
              value: "asset-class:CASH_AND_CASH_EQUIVALENTS",
              label: "Cash & Cash Equivalents",
              kind: "gainLoss",
            },
          ],
          netWorth: [
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
        scopedMetricValue: period.length + 20,
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("retains zero-only scopes and empty groups from the request hierarchy", async () => {
    const original = loadPeriodHistoryPointContext.getMockImplementation()!;
    loadPeriodHistoryPointContext.mockImplementation(async (args) => ({
      ...(await original(args)),
      netWorthScopes: [
        {
          value: "group:empty",
          label: "Empty",
          kind: "group",
          treeLabel: "Empty",
        },
        {
          value: "account:zero",
          label: "Zero",
          kind: "account",
          treeLabel: "Zero",
        },
      ],
    }));
    const point = loadPeriodHistoryPoint.getMockImplementation()!;
    loadPeriodHistoryPoint.mockImplementation(async (args) => ({
      ...(await point(args)),
      scopedMetricValue: 0,
    }));
    loadHistoryOpeningBalancePoint.mockResolvedValueOnce({
      date: "2026-01-04T00:00:00Z",
      label: "Opening Balance",
      assets: 150,
      liabilities: 40,
      netWorth: 110,
      scopedMetricValue: 0,
    });
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-1",
        granularity: "month",
        scopedMetric: "netWorth",
        netWorthScope: "account:zero",
      },
    });
    expect(result.scopeSelection.netWorth).toBe("account:zero");
    expect(result.points.map((point) => point.netWorth)).toEqual([0, 0, 0]);
    expect(result.openingBalancePoint.netWorth).toBe(0);
    expect(result.scopeOptions.netWorth.map((option) => option.value)).toEqual([
      "total",
      "group:asset-g",
      "group:empty",
      "account:liability-a",
      "account:zero",
    ]);
    expect(loadPeriodHistoryPointContext).toHaveBeenCalledTimes(1);
  });

  test.each(["month", "year"] as const)(
    "preserves signed account values across zero in %s history",
    async (granularity) => {
      const option = {
        value: "account:crossing",
        label: "Crossing Account",
        kind: "account",
      };
      loadPeriodHistoryPointContext.mockResolvedValue({
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

  test("keeps merged Gain/Loss scopes in asset-class order", async () => {
    const original = loadPeriodHistoryPoint.getMockImplementation()!;
    loadPeriodHistoryPoint.mockImplementation(async (args) => {
      const point = await original(args);
      const assetClass =
        args.period === "2026-01"
          ? "unclassified"
          : args.period === "2026-02"
            ? "EQUITIES"
            : "CASH_AND_CASH_EQUIVALENTS";
      return {
        ...point,
        scopeOptions: {
          ...point.scopeOptions,
          gainsLosses: [
            {
              value: `asset-class:${assetClass}`,
              label: assetClass,
              kind: "gainLoss",
            },
            {
              value: `gain-loss-account:${assetClass}`,
              label: `${assetClass} / Account`,
              kind: "gainLoss",
              parentValue: `asset-class:${assetClass}`,
            },
          ],
        },
      };
    });
    const result = await getPeriodHistory({
      data: { accountBookId: "book-1", granularity: "month" },
    });
    expect(
      result.scopeOptions.gainsLosses.map((option) => option.value),
    ).toEqual([
      "total",
      "asset-class:CASH_AND_CASH_EQUIVALENTS",
      "gain-loss-account:CASH_AND_CASH_EQUIVALENTS",
      "asset-class:EQUITIES",
      "gain-loss-account:EQUITIES",
      "asset-class:unclassified",
      "gain-loss-account:unclassified",
    ]);
  });

  test("unions Account Structure G/L scopes across periods and keeps missing points at zero", async () => {
    const original = loadPeriodHistoryPoint.getMockImplementation()!;
    loadPeriodHistoryPoint.mockImplementation(async (args) => {
      const point = await original(args);
      return {
        ...point,
        scopedMetricValue: args.period === "2026-01" ? 12 : 0,
        scopeOptions: {
          ...point.scopeOptions,
          gainsLosses: [
            ...point.scopeOptions.gainsLosses,
            ...(args.period === "2026-01"
              ? [
                  {
                    value: "group:pension",
                    label: "Pension",
                    kind: "gainLoss",
                    grouping: "accountStructure",
                  },
                  {
                    value: "account:portfolio",
                    label: "Pension / Portfolio",
                    kind: "gainLoss",
                    grouping: "accountStructure",
                    accountId: "portfolio",
                    parentValue: "group:pension",
                  },
                ]
              : []),
          ],
        },
      };
    });
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-1",
        granularity: "month",
        scopedMetric: "gainsLosses",
        gainLossScope: "group:pension",
      },
    });
    expect(result.scopeSelection.gainsLosses).toBe("group:pension");
    expect(result.points.map((point) => point.gainsLosses)).toEqual([12, 0, 0]);
    expect(result.scopeOptions.gainsLosses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "account:portfolio",
          grouping: "accountStructure",
        }),
        expect.objectContaining({
          value: "asset-class:CASH_AND_CASH_EQUIVALENTS",
        }),
      ]),
    );
    expect(loadPeriodHistoryPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        metricScopeFilter: { metric: "gainsLosses", scope: "group:pension" },
      }),
    );
  });

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

  test("rejects unsupported granularity", async () => {
    await expect(
      getPeriodHistory({
        data: {
          accountBookId: "book-1",
          granularity: "quarter",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
