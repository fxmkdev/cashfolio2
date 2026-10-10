import { beforeEach, describe, expect, test, vi } from "vitest";
import { getGainLossEquityAccountId } from "@/server/accounts";
import { getPeriodHistory } from "@/server/period-history";
import { loadHistoryPageData } from "./-page-loader";

vi.mock("@/server/period-history", () => ({
  getPeriodHistory: vi.fn(),
}));

vi.mock("@/server/accounts", () => ({ getGainLossEquityAccountId: vi.fn() }));

const mockedGetPeriodHistory = vi.mocked(getPeriodHistory);

const historyFixture: Awaited<ReturnType<typeof getPeriodHistory>> = {
  referenceCurrency: "CHF",
  hasCashAccounts: true,
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
      cashFlow: 5,
      income: 12,
      expenses: 6,
      gainsLosses: 4,
      assets: 100,
      liabilities: 40,
      netWorth: 60,
    },
  ],
  scopeOptions: {
    cashFlow: [{ value: "total", label: "Total", kind: "total" }],
    income: [{ value: "total", label: "Total", kind: "total" }],
    expenses: [{ value: "total", label: "Total", kind: "total" }],
    gainsLosses: [{ value: "total", label: "Total", kind: "total" }],
    assets: [{ value: "total", label: "Total", kind: "total" }],
    liabilities: [{ value: "total", label: "Total", kind: "total" }],
  },
  scopeSelection: {
    cashFlow: "total",
    income: "total",
    expenses: "total",
    gainsLosses: "total",
    assets: "total",
    liabilities: "total",
  },
};

describe("loadHistoryPageData", () => {
  beforeEach(() => {
    mockedGetPeriodHistory.mockReset();
    vi.mocked(getGainLossEquityAccountId).mockReset();
  });

  test("loads history for the selected mode", async () => {
    mockedGetPeriodHistory.mockResolvedValueOnce(historyFixture);

    const result = await loadHistoryPageData({
      accountBookId: "book-1",
      mode: "year",
      scopedMetric: "income",
      cashFlowScope: "total",
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
        cashFlowScope: "total",
        incomeScope: "group:income-1",
        expenseScope: "total",
        gainLossScope: "total",
        assetScope: "total",
        liabilityScope: "total",
        locale: "en-US",
      },
    });
    expect(getGainLossEquityAccountId).not.toHaveBeenCalled();
    expect(result).toEqual({
      gainLossEquityAccountId: null,
      history: {
        referenceCurrency: "CHF",
        hasCashAccounts: true,
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
            cashFlow: 5,
            income: 12,
            expenses: 6,
            gainsLosses: 4,
            assets: 100,
            liabilities: 40,
            netWorth: 60,
          },
        ],
        scopeOptions: {
          cashFlow: [{ value: "total", label: "Total", kind: "total" }],
          income: [{ value: "total", label: "Total", kind: "total" }],
          expenses: [{ value: "total", label: "Total", kind: "total" }],
          gainsLosses: [{ value: "total", label: "Total", kind: "total" }],
          assets: [{ value: "total", label: "Total", kind: "total" }],
          liabilities: [{ value: "total", label: "Total", kind: "total" }],
        },
        scopeSelection: {
          cashFlow: "total",
          income: "total",
          expenses: "total",
          gainsLosses: "total",
          assets: "total",
          liabilities: "total",
        },
      },
    });
  });

  test.each([
    "explicit-account:cash",
    "unit-account:fx:USD:cash",
    "total",
  ] as const)(
    "looks up Gain/Loss ledger only for an active validated Explicit G/L leaf (%s)",
    async (scope) => {
      mockedGetPeriodHistory.mockResolvedValueOnce({
        ...historyFixture,
        scopeSelection: {
          ...historyFixture.scopeSelection,
          gainsLosses: scope,
        },
      });
      vi.mocked(getGainLossEquityAccountId).mockResolvedValueOnce("gain-loss");
      const result = await loadHistoryPageData({
        accountBookId: "book-1",
        mode: "month",
        scopedMetric: "gainsLosses",
        cashFlowScope: "total",
        incomeScope: "total",
        expenseScope: "total",
        gainLossScope: "explicit-account:cash",
        assetScope: "total",
        liabilityScope: "total",
      });
      expect(result.gainLossEquityAccountId).toBe(
        scope.startsWith("explicit-account:") ? "gain-loss" : null,
      );
      if (scope.startsWith("explicit-account:"))
        expect(getGainLossEquityAccountId).toHaveBeenCalledWith({
          data: { accountBookId: "book-1" },
        });
      else expect(getGainLossEquityAccountId).not.toHaveBeenCalled();
    },
  );
});
