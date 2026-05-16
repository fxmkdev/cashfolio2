import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
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
const loadPeriodTimelinePoint = vi.hoisted(() => vi.fn());
const loadPeriodTimelinePointContext = vi.hoisted(() => vi.fn());
const loadTimelineOpeningBalancePoint = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("./period-timeline-point.server", () => ({
  loadPeriodTimelinePoint,
  loadPeriodTimelinePointContext,
}));

vi.mock("./period-timeline-opening-balance.server", () => ({
  loadTimelineOpeningBalancePoint,
}));

import {
  buildTimelinePeriodValues,
  getPeriodTimeline,
} from "./period-timeline";

describe("buildTimelinePeriodValues", () => {
  test("builds monthly values from account-book start month to current month", () => {
    expect(
      buildTimelinePeriodValues({
        granularity: "month",
        minDate: new Date("2024-11-19T10:15:00.000Z"),
        maxDate: new Date("2025-03-02T21:30:00.000Z"),
      }),
    ).toEqual(["2024-11", "2024-12", "2025-01", "2025-02", "2025-03"]);
  });

  test("builds yearly values from account-book start year to current year", () => {
    expect(
      buildTimelinePeriodValues({
        granularity: "year",
        minDate: new Date("2022-07-01T00:00:00.000Z"),
        maxDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  test("returns empty values for inverted ranges", () => {
    expect(
      buildTimelinePeriodValues({
        granularity: "month",
        minDate: new Date("2026-05-01T00:00:00.000Z"),
        maxDate: new Date("2026-04-01T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});

describe("getPeriodTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:00.000Z"));

    loadPeriodTimelinePointContext.mockResolvedValue({
      referenceCurrency: "CHF",
      accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
      holdingAccountsResolved: [],
    });
    loadTimelineOpeningBalancePoint.mockResolvedValue({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 150,
      liabilities: 40,
      netWorth: 110,
    });

    loadPeriodTimelinePoint.mockImplementation(
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
        income: period.length + 2,
        expenses: period.length + 3,
        gainsLosses: period.length + 4,
        assets: period.length + 5,
        liabilities: period.length + 6,
        netWorth: period.length + 7,
        scopeOptions: {
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
              value: "unit-type:fx",
              label: "FX",
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

  test("authorizes and builds monthly points from account-book start to current month", async () => {
    const result = await getPeriodTimeline({
      data: {
        accountBookId: "book-1",
        granularity: "month",
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(loadPeriodTimelinePointContext).toHaveBeenCalledTimes(1);
    expect(loadPeriodTimelinePointContext).toHaveBeenCalledWith({
      accountBookId: "book-1",
    });

    expect(loadPeriodTimelinePoint).toHaveBeenCalledTimes(3);
    expect(loadTimelineOpeningBalancePoint).toHaveBeenCalledTimes(1);
    expect(loadTimelineOpeningBalancePoint).toHaveBeenCalledWith({
      accountBookId: "book-1",
      accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
      referenceCurrency: "CHF",
      metricScopeFilter: undefined,
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(1, {
      accountBookId: "book-1",
      period: "2026-01",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
      },
      metricScopeFilter: undefined,
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(2, {
      accountBookId: "book-1",
      period: "2026-02",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
      },
      metricScopeFilter: undefined,
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(3, {
      accountBookId: "book-1",
      period: "2026-03",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
      },
      metricScopeFilter: undefined,
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    const valuationContexts = loadPeriodTimelinePoint.mock.calls.map(
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
          income: 9,
          expenses: 10,
          gainsLosses: 11,
          assets: 12,
          liabilities: 13,
          netWorth: 14,
        },
      ],
      scopeOptions: {
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
            value: "unit-type:fx",
            label: "FX",
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
        income: "total",
        expenses: "total",
        gainsLosses: "total",
        assets: "total",
        liabilities: "total",
      },
    });
  });

  test("builds yearly timeline points for year granularity", async () => {
    await getPeriodTimeline({
      data: {
        accountBookId: "book-2",
        granularity: "year",
        scopedMetric: "income",
        incomeScope: "account:income-a",
        expenseScope: "total",
      },
    });

    expect(loadPeriodTimelinePointContext).toHaveBeenCalledTimes(1);
    expect(loadPeriodTimelinePointContext).toHaveBeenCalledWith({
      accountBookId: "book-2",
    });
    expect(loadPeriodTimelinePoint).toHaveBeenCalledTimes(1);
    expect(loadTimelineOpeningBalancePoint).toHaveBeenCalledTimes(1);
    expect(loadPeriodTimelinePoint).toHaveBeenCalledWith({
      accountBookId: "book-2",
      period: "2026",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
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

  test("keeps merged Gain/Loss scope options in Period hierarchy order", async () => {
    loadPeriodTimelinePoint.mockImplementation(
      async ({ period }: { period: string }) => ({
        selectedPeriodValue: period,
        selectedPeriodLabel: `Label ${period}`,
        selectedPeriodEnd:
          period === "2026-03"
            ? new Date("2026-03-17T00:00:00.000Z")
            : period === "2026-02"
              ? new Date("2026-02-28T00:00:00.000Z")
              : new Date("2026-01-31T00:00:00.000Z"),
        totalReturn: 0,
        savings: 0,
        income: 0,
        expenses: 0,
        gainsLosses: 0,
        assets: 0,
        liabilities: 0,
        netWorth: 0,
        scopeOptions: {
          income: [],
          expenses: [],
          gainsLosses:
            period === "2026-01"
              ? [
                  {
                    value: "unit-type:explicit",
                    label: "Explicit G/L",
                    kind: "gainLoss",
                  },
                  {
                    value: "explicit-account:cash",
                    label: "Explicit G/L / Cash",
                    kind: "gainLoss",
                    parentValue: "unit-type:explicit",
                  },
                ]
              : period === "2026-02"
                ? [
                    {
                      value: "unit-type:fx",
                      label: "FX",
                      kind: "gainLoss",
                    },
                    {
                      value: "unit:fx:USD",
                      label: "FX / USD",
                      kind: "gainLoss",
                      parentValue: "unit-type:fx",
                    },
                    {
                      value: "unit-account:fx:USD:cash-usd",
                      label: "FX / USD / USD Cash",
                      kind: "gainLoss",
                      parentValue: "unit:fx:USD",
                    },
                  ]
                : [
                    {
                      value: "unit-type:security",
                      label: "Security",
                      kind: "gainLoss",
                    },
                    {
                      value: "unit:security:AAPL:USD",
                      label: "Security / AAPL (USD)",
                      kind: "gainLoss",
                      parentValue: "unit-type:security",
                    },
                    {
                      value: "unit-account:security:AAPL:USD:brokerage",
                      label: "Security / AAPL (USD) / Brokerage",
                      kind: "gainLoss",
                      parentValue: "unit:security:AAPL:USD",
                    },
                  ],
          assets: [],
          liabilities: [],
        },
      }),
    );

    const result = await getPeriodTimeline({
      data: {
        accountBookId: "book-1",
        granularity: "month",
      },
    });

    expect(
      result.scopeOptions.gainsLosses.map((option) => option.value),
    ).toEqual([
      "total",
      "unit-type:fx",
      "unit:fx:USD",
      "unit-account:fx:USD:cash-usd",
      "unit-type:security",
      "unit:security:AAPL:USD",
      "unit-account:security:AAPL:USD:brokerage",
      "unit-type:explicit",
      "explicit-account:cash",
    ]);
  });

  test("applies scoped asset values and scoped opening balance", async () => {
    loadTimelineOpeningBalancePoint.mockResolvedValueOnce({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 150,
      liabilities: 40,
      netWorth: 110,
      scopedMetricValue: 90,
    });

    const result = await getPeriodTimeline({
      data: {
        accountBookId: "book-assets",
        granularity: "year",
        scopedMetric: "assets",
        assetScope: "group:asset-g",
      },
    });

    expect(loadPeriodTimelinePoint).toHaveBeenCalledWith({
      accountBookId: "book-assets",
      period: "2026",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
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
    expect(loadTimelineOpeningBalancePoint).toHaveBeenCalledWith({
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
    const result = await getPeriodTimeline({
      data: {
        accountBookId: "book-gains",
        granularity: "year",
        scopedMetric: "gainsLosses",
        gainLossScope: "unit-type:fx",
      },
    });

    expect(loadPeriodTimelinePoint).toHaveBeenCalledWith({
      accountBookId: "book-gains",
      period: "2026",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
      },
      metricScopeFilter: {
        metric: "gainsLosses",
        scope: "unit-type:fx",
      },
      valuationContext: {
        exchangeRateByKey: expect.any(Map),
      },
      locale: "en-US",
    });
    expect(loadTimelineOpeningBalancePoint).toHaveBeenCalledWith({
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
    expect(result.scopeSelection.gainsLosses).toBe("unit-type:fx");
  });

  test("falls back to total values when scoped selection is stale", async () => {
    const result = await getPeriodTimeline({
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
      income: "total",
      expenses: "total",
      gainsLosses: "total",
      assets: "total",
      liabilities: "total",
    });
  });

  test("falls back to total liabilities when scoped liability selection is stale", async () => {
    const result = await getPeriodTimeline({
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
    const result = await getPeriodTimeline({
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
      getPeriodTimeline({
        data: {
          accountBookId: "book-1",
          granularity: "quarter",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
