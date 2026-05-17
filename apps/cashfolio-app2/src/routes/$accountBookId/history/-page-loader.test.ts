import { beforeEach, describe, expect, test, vi } from "vitest";
import { getPeriodHistory } from "@/server/period-history";
import { loadHistoryPageData } from "./-page-loader";

vi.mock("@/server/period-history", () => ({
  getPeriodHistory: vi.fn(),
}));

const mockedGetPeriodHistory = vi.mocked(getPeriodHistory);

describe("loadHistoryPageData", () => {
  beforeEach(() => {
    mockedGetPeriodHistory.mockReset();
  });

  test("loads history for the selected mode", async () => {
    mockedGetPeriodHistory.mockResolvedValueOnce({
      referenceCurrency: "CHF",
      openingBalancePoint: {
        date: "2025-12-31T00:00:00.000Z",
        label: "Opening Balance",
        assets: 80,
        liabilities: 20,
        netWorth: 60,
      },
      points: [
        {
          periodValue: "2026-01",
          periodLabel: "January 2026",
          periodEndDate: "2026-01-31T00:00:00.000Z",
          totalReturn: 10,
          savings: 6,
          income: 12,
          expenses: 6,
          gainsLosses: 4,
          assets: 100,
          liabilities: 40,
          netWorth: 60,
        },
      ],
      scopeOptions: {
        income: [{ value: "total", label: "Total", kind: "total" }],
        expenses: [{ value: "total", label: "Total", kind: "total" }],
        gainsLosses: [{ value: "total", label: "Total", kind: "total" }],
        assets: [{ value: "total", label: "Total", kind: "total" }],
        liabilities: [{ value: "total", label: "Total", kind: "total" }],
      },
      scopeSelection: {
        income: "total",
        expenses: "total",
        gainsLosses: "total",
        assets: "total",
        liabilities: "total",
      },
    });

    const result = await loadHistoryPageData({
      accountBookId: "book-1",
      mode: "year",
      scopedMetric: "income",
      incomeScope: "group:income-1",
      expenseScope: "total",
      gainLossScope: "total",
      assetScope: "total",
      liabilityScope: "total",
    });

    expect(mockedGetPeriodHistory).toHaveBeenCalledTimes(1);
    expect(mockedGetPeriodHistory).toHaveBeenNthCalledWith(1, {
      data: {
        accountBookId: "book-1",
        granularity: "year",
        scopedMetric: "income",
        incomeScope: "group:income-1",
        expenseScope: "total",
        gainLossScope: "total",
        assetScope: "total",
        liabilityScope: "total",
        locale: "en-US",
      },
    });
    expect(result).toEqual({
      history: {
        referenceCurrency: "CHF",
        openingBalancePoint: {
          date: "2025-12-31T00:00:00.000Z",
          label: "Opening Balance",
          assets: 80,
          liabilities: 20,
          netWorth: 60,
        },
        points: [
          {
            periodValue: "2026-01",
            periodLabel: "January 2026",
            periodEndDate: "2026-01-31T00:00:00.000Z",
            totalReturn: 10,
            savings: 6,
            income: 12,
            expenses: 6,
            gainsLosses: 4,
            assets: 100,
            liabilities: 40,
            netWorth: 60,
          },
        ],
        scopeOptions: {
          income: [{ value: "total", label: "Total", kind: "total" }],
          expenses: [{ value: "total", label: "Total", kind: "total" }],
          gainsLosses: [{ value: "total", label: "Total", kind: "total" }],
          assets: [{ value: "total", label: "Total", kind: "total" }],
          liabilities: [{ value: "total", label: "Total", kind: "total" }],
        },
        scopeSelection: {
          income: "total",
          expenses: "total",
          gainsLosses: "total",
          assets: "total",
          liabilities: "total",
        },
      },
    });
  });
});
