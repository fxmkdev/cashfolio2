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

const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("./period-timeline-point.server", () => ({
  loadPeriodTimelinePoint,
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

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "chf",
      startDate: new Date("2026-01-05T00:00:00.000Z"),
    });

    loadPeriodTimelinePoint.mockImplementation(
      async ({ period }: { period: string; accountBookId: string }) => ({
        selectedPeriodValue: period,
        selectedPeriodLabel: `Label ${period}`,
        totalReturn: period.length,
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
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-1" },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    });

    expect(loadPeriodTimelinePoint).toHaveBeenCalledTimes(3);
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(1, {
      accountBookId: "book-1",
      period: "2026-01",
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(2, {
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(loadPeriodTimelinePoint).toHaveBeenNthCalledWith(3, {
      accountBookId: "book-1",
      period: "2026-03",
    });

    expect(result).toEqual({
      referenceCurrency: "CHF",
      points: [
        {
          periodValue: "2026-01",
          periodLabel: "Label 2026-01",
          totalReturn: 7,
        },
        {
          periodValue: "2026-02",
          periodLabel: "Label 2026-02",
          totalReturn: 7,
        },
        {
          periodValue: "2026-03",
          periodLabel: "Label 2026-03",
          totalReturn: 7,
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

    expect(loadPeriodTimelinePoint).toHaveBeenCalledTimes(1);
    expect(loadPeriodTimelinePoint).toHaveBeenCalledWith({
      accountBookId: "book-2",
      period: "2026",
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
