import { describe, expect, test, vi } from "vitest";
vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: vi.fn(),
}));
vi.mock("../prisma.server", () => ({
  prisma: {},
}));
vi.mock("./valuation.server", () => ({
  getCurrencyExchangeRate: vi.fn(),
  getCryptocurrencyToCurrencyExchangeRate: vi.fn(),
  getSecurityToCurrencyExchangeRate: vi.fn(),
}));
import { Unit } from "../.prisma-client/enums";
import {
  DEFAULT_PERIOD_VALUE,
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  isMultiUnitTransaction,
  normalizePeriodValue,
  resolvePeriodSelection,
  shouldIncludeTransactionForPeriod,
} from "./period";
import { buildBreakdownHierarchyWithMeta } from "./period-helpers";

describe("normalizePeriodValue", () => {
  test("normalizes valid values", () => {
    expect(normalizePeriodValue(" LAST-MONTH ")).toBe("last-month");
    expect(normalizePeriodValue("2026-3")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("2026-03")).toBe("2026-03");
    expect(normalizePeriodValue("2026")).toBe("2026");
  });

  test("falls back to default for unsupported values", () => {
    expect(normalizePeriodValue("0099")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("0100")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("0099-01")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("0100-01")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("not-valid")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue(null)).toBe(DEFAULT_PERIOD_VALUE);
  });
});

describe("resolvePeriodSelection", () => {
  test("uses yesterday cutoff for current month (MTD)", () => {
    const selection = resolvePeriodSelection({
      periodValue: "mtd",
      now: new Date("2026-03-28T15:30:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(selection.periodSpecifier).toBe("mtd");
  });

  test("clamps current period to a non-inverted range on the first day", () => {
    const selection = resolvePeriodSelection({
      periodValue: "mtd",
      now: new Date("2026-03-01T10:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  test("uses yesterday cutoff for current year (YTD)", () => {
    const selection = resolvePeriodSelection({
      periodValue: "ytd",
      now: new Date("2026-03-28T10:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(selection.periodSpecifier).toBe("ytd");
  });

  test("uses natural month end for historical months", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2024-02",
      now: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(selection.periodSpecifier).toBe("month");
  });

  test("clamps explicit month to current month when no bookings exist", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2000-01",
      now: new Date("2026-03-28T00:00:00.000Z"),
      firstBookingDate: null,
    });

    expect(selection.year).toBe(2026);
    expect(selection.month).toBe(2);
    expect(selection.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(selection.periodSpecifier).toBe("month");
  });

  test("uses natural year end for historical years", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2025",
      now: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2025-12-31T00:00:00.000Z");
    expect(selection.periodSpecifier).toBe("year");
  });

  test("clamps explicit year to current year when no bookings exist", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2000",
      now: new Date("2026-03-28T00:00:00.000Z"),
      firstBookingDate: null,
    });

    expect(selection.year).toBe(2026);
    expect(selection.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(selection.periodSpecifier).toBe("year");
  });

  test("starts first year at first booking month", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2026",
      now: new Date("2026-11-15T00:00:00.000Z"),
      firstBookingDate: new Date("2026-05-13T10:30:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });
});

describe("transaction period inclusion", () => {
  const periodStart = new Date("2026-02-01T00:00:00.000Z");
  const periodEndExclusive = new Date("2026-03-01T00:00:00.000Z");

  test("includes transactions when at least one booking is in period and none after end", () => {
    expect(
      shouldIncludeTransactionForPeriod({
        bookingDates: [
          new Date("2026-01-25T00:00:00.000Z"),
          new Date("2026-02-14T00:00:00.000Z"),
        ],
        periodStart,
        periodEndExclusive,
      }),
    ).toBe(true);
  });

  test("excludes transactions when latest booking is on/after period end", () => {
    expect(
      shouldIncludeTransactionForPeriod({
        bookingDates: [
          new Date("2026-02-14T00:00:00.000Z"),
          new Date("2026-03-01T00:00:00.000Z"),
        ],
        periodStart,
        periodEndExclusive,
      }),
    ).toBe(false);
  });

  test("excludes transactions without any booking in period", () => {
    expect(
      shouldIncludeTransactionForPeriod({
        bookingDates: [
          new Date("2026-01-14T00:00:00.000Z"),
          new Date("2026-01-20T00:00:00.000Z"),
        ],
        periodStart,
        periodEndExclusive,
      }),
    ).toBe(false);
  });

  test("detects multi-unit transactions", () => {
    expect(
      isMultiUnitTransaction([
        {
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          unit: Unit.CURRENCY,
          currency: "EUR",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ]),
    ).toBe(true);

    expect(
      isMultiUnitTransaction([
        {
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ]),
    ).toBe(false);

    expect(
      isMultiUnitTransaction([
        {
          unit: Unit.SECURITY,
          currency: null,
          cryptocurrency: null,
          symbol: "AAPL",
          tradeCurrency: "USD",
        },
        {
          unit: Unit.SECURITY,
          currency: null,
          cryptocurrency: null,
          symbol: "AAPL",
          tradeCurrency: "CHF",
        },
      ]),
    ).toBe(true);
  });
});

describe("computeHoldingGainLossForEventSeries", () => {
  test("uses the same sign convention as transaction gain/loss", () => {
    const gainLoss = computeHoldingGainLossForEventSeries({
      initialBalance: 1000,
      initialRate: 1.2,
      events: [
        { rate: 1.1, balanceDelta: 200 },
        { rate: 1.05, balanceDelta: 0 },
      ],
    });

    // event 1: 1000 * (1.1 - 1.2) = -100
    // event 2: 1200 * (1.05 - 1.1) = -60
    expect(gainLoss).toBeCloseTo(-160, 10);
  });
});

describe("expense breakdown grouping", () => {
  const groupById = new Map([
    [
      "expenses",
      {
        id: "expenses",
        name: "Expenses",
        parentGroupId: null,
      },
    ],
    [
      "housing",
      {
        id: "housing",
        name: "Housing",
        parentGroupId: "expenses",
      },
    ],
    [
      "rent",
      {
        id: "rent",
        name: "Rent",
        parentGroupId: "housing",
      },
    ],
  ]);

  test("buckets by top-level root group", () => {
    expect(
      createBreakdownBucket({
        accountId: "account-rent",
        accountName: "Rent Account",
        groupId: "rent",
        groupById,
      }),
    ).toEqual({
      id: "group:expenses",
      label: "Expenses",
      kind: "group",
    });
  });

  test("falls back to account bucket when group cannot be resolved", () => {
    expect(
      createBreakdownBucket({
        accountId: "account-misc",
        accountName: "Misc",
        groupId: "missing-group",
        groupById,
      }),
    ).toEqual({
      id: "account:account-misc",
      label: "Misc",
      kind: "account",
    });
  });

  test("keeps only positive-net buckets and computes percentages", () => {
    const breakdown = buildBreakdownItems([
      {
        id: "group:housing",
        label: "Housing",
        kind: "group",
        amount: 1900,
      },
      {
        id: "group:food",
        label: "Food",
        kind: "group",
        amount: 1100,
      },
      {
        id: "account:refunds",
        label: "Refunds",
        kind: "account",
        amount: -200,
      },
    ]);

    expect(breakdown.totalAmount).toBe(3000);
    expect(breakdown.items).toHaveLength(2);
    expect(breakdown.items[0]).toMatchObject({
      id: "group:housing",
      percentage: 63.33,
    });
    expect(breakdown.items[1]).toMatchObject({
      id: "group:food",
      percentage: 36.67,
    });
  });
});

describe("breakdown hierarchy", () => {
  const groupById = new Map([
    [
      "expenses",
      {
        id: "expenses",
        name: "Expenses",
        parentGroupId: null,
      },
    ],
    [
      "housing",
      {
        id: "housing",
        name: "Housing",
        parentGroupId: "expenses",
      },
    ],
    [
      "rent",
      {
        id: "rent",
        name: "Rent",
        parentGroupId: "housing",
      },
    ],
    [
      "food",
      {
        id: "food",
        name: "Food",
        parentGroupId: "expenses",
      },
    ],
  ]);

  test("builds nested hierarchy from group ancestry", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: 1500,
        },
      ],
      groupById,
    });

    expect(hierarchy).toEqual([
      {
        id: "group:expenses",
        label: "Expenses",
        kind: "group",
        amount: 1500,
        children: [
          {
            id: "group:housing",
            label: "Housing",
            kind: "group",
            amount: 1500,
            children: [
              {
                id: "group:rent",
                label: "Rent",
                kind: "group",
                amount: 1500,
                children: [
                  {
                    id: "account:account-rent",
                    label: "Rent",
                    kind: "account",
                    amount: 1500,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  test("includes ungrouped accounts at root", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: 900,
        },
        {
          accountId: "account-misc",
          accountName: "Misc",
          groupId: null,
          amount: 100,
        },
      ],
      groupById,
    });

    expect(hierarchy.map((item) => item.id)).toEqual([
      "group:expenses",
      "account:account-misc",
    ]);
  });

  test("prunes non-positive branches after account-level accumulation", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: 1000,
        },
        {
          accountId: "account-refund",
          accountName: "Refund",
          groupId: "rent",
          amount: -1000,
        },
      ],
      groupById,
    });

    expect(hierarchy).toEqual([]);
  });

  test("orders siblings by descending amount with deterministic tie-breakers", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-food",
          accountName: "Food Account",
          groupId: "food",
          amount: 100,
        },
        {
          accountId: "account-rent",
          accountName: "Rent Account",
          groupId: "rent",
          amount: 300,
        },
        {
          accountId: "account-travel",
          accountName: "Travel",
          groupId: null,
          amount: 100,
        },
      ],
      groupById,
    });

    expect(hierarchy.map((item) => item.id)).toEqual([
      "group:expenses",
      "account:account-travel",
    ]);
    expect(hierarchy[0]?.children.map((item) => item.id)).toEqual([
      "group:housing",
      "group:food",
    ]);
  });

  test("flags hidden amount discrepancies when pruned leaves affect parent totals", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: 100,
        },
        {
          accountId: "account-refund",
          accountName: "Refund",
          groupId: "rent",
          amount: -20,
        },
      ],
      groupById,
    });

    expect(result.hasHiddenAmountDiscrepancy).toBe(true);
    expect(result.hiddenAmountDiscrepancyNodeIds).toEqual([
      "group:expenses",
      "group:housing",
      "group:rent",
    ]);
    expect(result.hierarchy).toEqual([
      {
        id: "group:expenses",
        label: "Expenses",
        kind: "group",
        amount: 80,
        children: [
          {
            id: "group:housing",
            label: "Housing",
            kind: "group",
            amount: 80,
            children: [
              {
                id: "group:rent",
                label: "Rent",
                kind: "group",
                amount: 80,
                children: [
                  {
                    id: "account:account-rent",
                    label: "Rent",
                    kind: "account",
                    amount: 100,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  test("does not flag discrepancies caused only by rounding distribution", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-a",
          accountName: "A",
          groupId: "rent",
          amount: 0.005,
        },
        {
          accountId: "account-b",
          accountName: "B",
          groupId: "rent",
          amount: 0.005,
        },
      ],
      groupById,
    });

    expect(result.hasHiddenAmountDiscrepancy).toBe(false);
    expect(result.hiddenAmountDiscrepancyNodeIds).toEqual([]);
  });
});
