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

vi.mock("../account-books/functions.server", () => ({
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
        totalReturn: period.length,
        savings: period.length + 1,
        income: period.length + 2,
        expenses: period.length + 3,
        gainsLosses: period.length + 4,
        assets: period.length + 5,
        liabilities: period.length + 6,
        netWorth: period.length + 7,
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
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(1, {
      accountBookId: "book-1",
      period: "2026-01",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
      },
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(2, {
      accountBookId: "book-1",
      period: "2026-02",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
      },
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(3, {
      accountBookId: "book-1",
      period: "2026-03",
      context: {
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
      },
    });

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
    });
  });

  test("builds yearly timeline points for year granularity", async () => {
    await getPeriodTimeline({
      data: {
        accountBookId: "book-2",
        granularity: "year",
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
    });
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
