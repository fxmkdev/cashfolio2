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
          assets: [
            {
              value: "group:asset-g",
              label: "Asset G",
              kind: "group",
            },
          ],
          liabilities: [
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

  test.each([
    ["month", "assets"],
    ["month", "liabilities"],
    ["year", "assets"],
    ["year", "liabilities"],
  ] as const)(
    "retains a crossing account's scoped %s/%s series across periods on the opposite side",
    async (granularity, metric) => {
      if (granularity === "year") {
        loadPeriodHistoryPointContext.mockResolvedValue({
          referenceCurrency: "CHF",
          accountBookStartDate: new Date("2024-01-01T00:00:00Z"),
          holdingAccountsResolved: [],
          hasCashAccounts: true,
        });
      }
      const original = loadPeriodHistoryPoint.getMockImplementation()!;
      const option = {
        value: "account:crossing",
        label: "Crossing Account",
        kind: "account",
      };
      loadPeriodHistoryPoint.mockImplementation(async (args) => {
        const base = await original(args);
        const index =
          granularity === "year"
            ? Number(args.period) - 2024
            : Number(args.period.slice(-2)) - 1;
        const balance = [25, 0, -10][index]!;
        const assets = Math.max(balance, 0);
        const liabilities = Math.max(-balance, 0);
        return {
          ...base,
          assets,
          liabilities,
          netWorth: balance,
          scopedMetricValue: metric === "assets" ? assets : liabilities,
          scopeOptions: {
            ...base.scopeOptions,
            assets: assets > 0 ? [option] : [],
            liabilities: liabilities > 0 ? [option] : [],
          },
        };
      });
      loadHistoryOpeningBalancePoint.mockResolvedValue({
        date: "2023-12-31T00:00:00Z",
        label: "Opening Balance",
        assets: 25,
        liabilities: 0,
        netWorth: 25,
        scopedMetricValue: metric === "assets" ? 25 : 0,
      });
      const result = await getPeriodHistory({
        data: {
          accountBookId: "book-1",
          granularity,
          scopedMetric: metric,
          ...(metric === "assets"
            ? { assetScope: "account:crossing" }
            : { liabilityScope: "account:crossing" }),
        },
      });
      expect(result.scopeSelection[metric]).toBe("account:crossing");
      expect(result.scopeOptions.assets).toContainEqual(option);
      expect(result.scopeOptions.liabilities).toContainEqual(option);
      expect(result.points.map((point) => point[metric])).toEqual(
        metric === "assets" ? [25, 0, 0] : [0, 0, 10],
      );
      expect(result.points.map((point) => point.netWorth)).toEqual([
        25, 0, -10,
      ]);
      expect(result.openingBalancePoint[metric]).toBe(
        metric === "assets" ? 25 : 0,
      );
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
        assets: [
          { value: "total", label: "Total", kind: "total" },
          {
            value: "group:asset-g",
            label: "Asset G",
            kind: "group",
          },
        ],
        liabilities: [
          { value: "total", label: "Total", kind: "total" },
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
        assets: "total",
        liabilities: "total",
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

  test("applies scoped asset values and scoped opening balance", async () => {
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
        scopedMetric: "assets",
        assetScope: "group:asset-g",
      },
    });

    expect(loadPeriodHistoryPoint).toHaveBeenCalledWith({
      accountBookId: "book-assets",
      period: "2026",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        hasCashAccounts: true,
      },
      metricScopeFilter: {
        metric: "assets",
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
        metric: "assets",
        scope: "group:asset-g",
      },
    });
    expect(result.openingBalancePoint).toEqual({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 90,
      liabilities: 40,
      netWorth: 110,
    });
    expect(result.points).toEqual([
      expect.objectContaining({
        assets: 24,
        liabilities: 10,
      }),
    ]);
    expect(result.scopeSelection.assets).toBe("group:asset-g");
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
      assets: "total",
      liabilities: "total",
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

  test("falls back to total liabilities when scoped liability selection is stale", async () => {
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-4",
        granularity: "year",
        scopedMetric: "liabilities",
        liabilityScope: "account:missing",
      },
    });

    expect(result.points).toEqual([
      expect.objectContaining({
        liabilities: 10,
      }),
    ]);
    expect(result.scopeSelection.liabilities).toBe("total");
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
