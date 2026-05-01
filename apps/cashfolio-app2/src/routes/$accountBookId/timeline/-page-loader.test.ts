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
      points: [
        {
          periodValue: "2026-01",
          periodLabel: "January 2026",
          totalReturn: 10,
        },
      ],
    });

    const result = await loadTimelinePageData({
      accountBookId: "book-1",
      mode: "year",
    });

    expect(mockedGetPeriodTimeline).toHaveBeenCalledTimes(1);
    expect(mockedGetPeriodTimeline).toHaveBeenNthCalledWith(1, {
      data: {
        accountBookId: "book-1",
        granularity: "year",
      },
    });
    expect(result).toEqual({
      timeline: {
        referenceCurrency: "CHF",
        points: [
          {
            periodValue: "2026-01",
            periodLabel: "January 2026",
            totalReturn: 10,
          },
        ],
      },
    });
  });
});
