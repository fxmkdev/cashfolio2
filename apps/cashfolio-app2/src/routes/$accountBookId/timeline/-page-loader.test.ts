import { beforeEach, describe, expect, test, vi } from "vitest";
import { getPeriodTimeline } from "@/server/period-timeline";
import { loadTimelinePageData } from "./-page-loader";

vi.mock("@/server/period-timeline", () => ({
  getPeriodTimeline: vi.fn(),
}));

const mockedGetPeriodTimeline = vi.mocked(getPeriodTimeline);

describe("loadTimelinePageData", () => {
  beforeEach(() => {
    mockedGetPeriodTimeline.mockReset();
  });

  test("loads timeline for the selected mode", async () => {
    mockedGetPeriodTimeline.mockResolvedValueOnce({
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
        assets: [{ value: "total", label: "Total", kind: "total" }],
        liabilities: [{ value: "total", label: "Total", kind: "total" }],
      },
      scopeSelection: {
        income: "total",
        expenses: "total",
        assets: "total",
        liabilities: "total",
      },
    });

    const result = await loadTimelinePageData({
      accountBookId: "book-1",
      mode: "year",
      scopedMetric: "income",
      incomeScope: "group:income-1",
      expenseScope: "total",
      assetScope: "total",
      liabilityScope: "total",
    });

    expect(mockedGetPeriodTimeline).toHaveBeenCalledTimes(1);
    expect(mockedGetPeriodTimeline).toHaveBeenNthCalledWith(1, {
      data: {
        accountBookId: "book-1",
        granularity: "year",
        scopedMetric: "income",
        incomeScope: "group:income-1",
        expenseScope: "total",
        assetScope: "total",
        liabilityScope: "total",
      },
    });
    expect(result).toEqual({
      timeline: {
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
          assets: [{ value: "total", label: "Total", kind: "total" }],
          liabilities: [{ value: "total", label: "Total", kind: "total" }],
        },
        scopeSelection: {
          income: "total",
          expenses: "total",
          assets: "total",
          liabilities: "total",
        },
      },
    });
  });
});
