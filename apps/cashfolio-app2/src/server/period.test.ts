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
import { AccountType, Unit } from "../.prisma-client/enums";
import {
  computeEndOfPeriodBalanceStats,
  DEFAULT_PERIOD_VALUE,
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  getPeriodEndExclusive,
  isMultiUnitTransaction,
  normalizePeriodValue,
  resolvePeriodSelection,
  shouldIncludeTransactionForPeriod,
} from "./period";
import {
  addGainsLossesUnitContribution,
  buildBreakdownHierarchyWithMeta,
  buildPeriodEndAllocationBreakdown,
  buildGainsLossesUnitBreakdownHierarchy,
  buildTransactionGainsLossesContributions,
  createGainsLossesUnitBreakdownAccumulator,
} from "./period-helpers";

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

describe("getPeriodEndExclusive", () => {
  test("returns the start of the next UTC day", () => {
    const result = getPeriodEndExclusive(new Date("2026-02-28T13:45:00.000Z"));

    expect(result.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("computeEndOfPeriodBalanceStats", () => {
  test("computes net worth as assets minus liabilities", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-chf",
          type: AccountType.ASSET,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "liability-usd",
          type: AccountType.LIABILITY,
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      rawBalanceByAccountId: new Map([
        ["asset-chf", 100],
        ["liability-usd", -40],
      ]),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference: async (input) => {
        if (input.currency === "USD") {
          return input.value * 2;
        }
        return input.value;
      },
    });

    expect(result).toEqual({
      assets: 100,
      liabilities: 80,
      netWorth: 20,
      skippedCount: 0,
    });
  });

  test("counts skipped conversions for missing unit metadata and null conversions", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const convertBalanceToReference = vi.fn(
      async (input: { value: number; symbol: string | null; date: Date }) => {
        if (input.symbol === "NO_RATE") {
          return null;
        }
        return input.value;
      },
    );

    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-ok",
          type: AccountType.ASSET,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "liability-ok",
          type: AccountType.LIABILITY,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "asset-missing-unit",
          type: AccountType.ASSET,
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: "asset-no-rate",
          type: AccountType.ASSET,
          unit: Unit.SECURITY,
          currency: null,
          cryptocurrency: null,
          symbol: "NO_RATE",
          tradeCurrency: "USD",
        },
      ],
      rawBalanceByAccountId: new Map([
        ["asset-ok", 50],
        ["liability-ok", -10],
        ["asset-missing-unit", 20],
        ["asset-no-rate", 5],
      ]),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference,
    });

    expect(result).toEqual({
      assets: 50,
      liabilities: 10,
      netWorth: 40,
      skippedCount: 2,
    });
    expect(convertBalanceToReference).toHaveBeenCalledTimes(3);
    expect(convertBalanceToReference).toHaveBeenCalledWith(
      expect.objectContaining({
        date: periodEnd,
      }),
    );
  });

  test("does not count missing-unit accounts without raw balance as skipped", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const convertBalanceToReference = vi.fn(
      async (input: { value: number }) => input.value,
    );

    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-missing-unit-no-balance",
          type: AccountType.ASSET,
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      rawBalanceByAccountId: new Map(),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference,
    });

    expect(result).toEqual({
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      skippedCount: 0,
    });
    expect(convertBalanceToReference).not.toHaveBeenCalled();
  });

  test("does not count missing-unit accounts with zero net raw balance as skipped", async () => {
    const periodEnd = new Date("2026-02-28T00:00:00.000Z");
    const convertBalanceToReference = vi.fn(
      async (input: { value: number }) => input.value,
    );

    const result = await computeEndOfPeriodBalanceStats({
      accounts: [
        {
          id: "asset-missing-unit-zero-net",
          type: AccountType.ASSET,
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      rawBalanceByAccountId: new Map([["asset-missing-unit-zero-net", 0]]),
      periodEnd,
      referenceCurrency: "CHF",
      convertBalanceToReference,
    });

    expect(result).toEqual({
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      skippedCount: 0,
    });
    expect(convertBalanceToReference).not.toHaveBeenCalled();
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

describe("gains/losses unit breakdown", () => {
  test("aggregates explicit, transaction, and holding contributions by unit", () => {
    const accumulator = createGainsLossesUnitBreakdownAccumulator();

    // Explicit gain/loss booking (FX)
    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.CURRENCY,
      currency: "usd",
      cryptocurrency: null,
      symbol: null,
      amount: 120,
    });
    // Transaction gain/loss booking (crypto)
    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.CRYPTOCURRENCY,
      currency: null,
      cryptocurrency: "btc",
      symbol: null,
      amount: -30,
    });
    // Holding gain/loss account (security)
    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      amount: 20,
    });

    const breakdown = buildGainsLossesUnitBreakdownHierarchy({ accumulator });

    expect(breakdown.hierarchy.map((item) => item.label)).toEqual([
      "FX",
      "Cryptocurrency",
      "Security",
    ]);
    expect(breakdown.hierarchy.map((item) => item.amount)).toEqual([
      120, -30, 20,
    ]);
    expect(breakdown.totalAmount).toBe(110);
  });

  test("excludes reference-currency contributions from FX attribution", () => {
    const accumulator = createGainsLossesUnitBreakdownAccumulator();

    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      amount: 25,
      referenceCurrency: "chf",
    });
    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.CURRENCY,
      currency: "USD",
      cryptocurrency: null,
      symbol: null,
      amount: 12,
      referenceCurrency: "CHF",
    });

    const breakdown = buildGainsLossesUnitBreakdownHierarchy({ accumulator });
    const fxGroup = breakdown.hierarchy[0];

    expect(fxGroup?.children).toEqual([
      {
        id: "account:fx:USD",
        label: "USD",
        kind: "account",
        amount: 12,
        children: [],
      },
    ]);
    expect(fxGroup?.amount).toBe(12);
  });

  test("groups security contributions by symbol only and keeps totals aligned", () => {
    const accumulator = createGainsLossesUnitBreakdownAccumulator();

    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "aapl",
      amount: 15,
    });
    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      amount: -4,
    });
    addGainsLossesUnitContribution({
      accumulator,
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "MSFT",
      amount: 5,
    });

    const breakdown = buildGainsLossesUnitBreakdownHierarchy({ accumulator });
    const securityGroup = breakdown.hierarchy[2];

    expect(securityGroup?.children).toEqual([
      {
        id: "account:security:AAPL",
        label: "AAPL",
        kind: "account",
        amount: 11,
        children: [],
      },
      {
        id: "account:security:MSFT",
        label: "MSFT",
        kind: "account",
        amount: 5,
        children: [],
      },
    ]);
    expect(securityGroup?.amount).toBe(16);
    expect(
      breakdown.hierarchy.reduce((sum, item) => sum + item.amount, 0),
    ).toBe(breakdown.totalAmount);
  });

  test("attributes multi-unit transaction gain/loss without reference-currency FX contributors", () => {
    const contributions = buildTransactionGainsLossesContributions({
      bookings: [
        {
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
        },
        {
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
        },
      ],
      convertedValues: [-107, 110],
      referenceCurrency: "CHF",
    });

    expect(contributions).toEqual([
      {
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        amount: 3,
      },
    ]);
  });

  test("returns no transaction attribution when net gain/loss is zero", () => {
    const contributions = buildTransactionGainsLossesContributions({
      bookings: [
        {
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
        },
        {
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
        },
        {
          unit: Unit.CURRENCY,
          currency: "EUR",
          cryptocurrency: null,
          symbol: null,
        },
      ],
      convertedValues: [-100, 60, 40],
      referenceCurrency: "CHF",
    });

    expect(contributions).toEqual([]);
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

  test("prunes tiny positive accounts that round to zero", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-tiny",
          accountName: "Tiny",
          groupId: "rent",
          amount: 0.004,
        },
      ],
      groupById,
    });

    expect(hierarchy).toEqual([]);
  });

  test("prunes groups that have no visible children after leaf pruning", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-tiny-a",
          accountName: "Tiny A",
          groupId: "rent",
          amount: 0.004,
        },
        {
          accountId: "account-tiny-b",
          accountName: "Tiny B",
          groupId: "rent",
          amount: 0.004,
        },
      ],
      groupById,
    });

    expect(result.hierarchy).toEqual([]);
    expect(result.hasHiddenAmountDiscrepancy).toBe(false);
    expect(result.hiddenAmountDiscrepancyNodeIds).toEqual([]);
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

  test("returns discrepancy node IDs in deterministic sorted order", () => {
    const customGroupById = new Map([
      [
        "z-root",
        {
          id: "z-root",
          name: "Z Root",
          parentGroupId: null,
        },
      ],
      [
        "a-child",
        {
          id: "a-child",
          name: "A Child",
          parentGroupId: "z-root",
        },
      ],
    ]);

    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "positive",
          accountName: "Positive",
          groupId: "a-child",
          amount: 100,
        },
        {
          accountId: "negative",
          accountName: "Negative",
          groupId: "a-child",
          amount: -25,
        },
      ],
      groupById: customGroupById,
    });

    expect(result.hasHiddenAmountDiscrepancy).toBe(true);
    expect(result.hiddenAmountDiscrepancyNodeIds).toEqual([
      "group:a-child",
      "group:z-root",
    ]);
  });

  test("keeps visible groups and flags discrepancy when rounded-to-zero children are hidden", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-food",
          accountName: "Food",
          groupId: "food",
          amount: 10,
        },
        {
          accountId: "account-tiny-a",
          accountName: "Tiny A",
          groupId: "rent",
          amount: 0.004,
        },
        {
          accountId: "account-tiny-b",
          accountName: "Tiny B",
          groupId: "rent",
          amount: 0.004,
        },
      ],
      groupById,
    });

    expect(result.hierarchy).toEqual([
      {
        id: "group:expenses",
        label: "Expenses",
        kind: "group",
        amount: 10.01,
        children: [
          {
            id: "group:food",
            label: "Food",
            kind: "group",
            amount: 10,
            children: [
              {
                id: "account:account-food",
                label: "Food",
                kind: "account",
                amount: 10,
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    expect(result.hasHiddenAmountDiscrepancy).toBe(true);
    expect(result.hiddenAmountDiscrepancyNodeIds).toEqual(["group:expenses"]);
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

describe("buildPeriodEndAllocationBreakdown", () => {
  const groupById = new Map([
    [
      "assets",
      {
        id: "assets",
        name: "Assets",
        parentGroupId: null,
      },
    ],
    [
      "liabilities",
      {
        id: "liabilities",
        name: "Liabilities",
        parentGroupId: null,
      },
    ],
  ]);

  test("applies liability display sign convention", () => {
    const result = buildPeriodEndAllocationBreakdown({
      items: [
        {
          accountId: "liability-card",
          accountName: "Credit Card",
          groupId: "liabilities",
          accountType: AccountType.LIABILITY,
          convertedBalanceInReferenceCurrency: -1200.5,
        },
      ],
      groupById,
    });

    expect(result.totalAmount).toBe(1200.5);
    expect(result.items).toEqual([
      {
        id: "group:liabilities",
        label: "Liabilities",
        kind: "group",
        amount: 1200.5,
        percentage: 100,
      },
    ]);
    expect(result.skippedMissingReferenceBalanceCount).toBe(0);
    expect(result.skippedNegativeCount).toBe(0);
  });

  test("tracks missing conversion and non-positive exclusions", () => {
    const result = buildPeriodEndAllocationBreakdown({
      items: [
        {
          accountId: "asset-missing",
          accountName: "Missing",
          groupId: "assets",
          accountType: AccountType.ASSET,
          convertedBalanceInReferenceCurrency: null,
        },
        {
          accountId: "asset-zero",
          accountName: "Zero",
          groupId: "assets",
          accountType: AccountType.ASSET,
          convertedBalanceInReferenceCurrency: 0,
        },
        {
          accountId: "liability-not-outstanding",
          accountName: "Not Outstanding",
          groupId: "liabilities",
          accountType: AccountType.LIABILITY,
          convertedBalanceInReferenceCurrency: 25,
        },
        {
          accountId: "asset-visible",
          accountName: "Visible",
          groupId: "assets",
          accountType: AccountType.ASSET,
          convertedBalanceInReferenceCurrency: 100,
        },
      ],
      groupById,
    });

    expect(result.items).toEqual([
      {
        id: "group:assets",
        label: "Assets",
        kind: "group",
        amount: 100,
        percentage: 100,
      },
    ]);
    expect(result.skippedMissingReferenceBalanceCount).toBe(1);
    expect(result.skippedNegativeCount).toBe(1);
  });

  test("propagates discrepancy metadata for hidden rounded children", () => {
    const result = buildPeriodEndAllocationBreakdown({
      items: [
        {
          accountId: "asset-main",
          accountName: "Main",
          groupId: "assets",
          accountType: AccountType.ASSET,
          convertedBalanceInReferenceCurrency: 100.002,
        },
        {
          accountId: "asset-tiny",
          accountName: "Tiny",
          groupId: "assets",
          accountType: AccountType.ASSET,
          convertedBalanceInReferenceCurrency: 0.004,
        },
      ],
      groupById,
    });

    expect(result.hasHiddenAmountDiscrepancy).toBe(true);
    expect(result.hiddenAmountDiscrepancyNodeIds).toEqual(["group:assets"]);
    expect(result.hierarchy).toEqual([
      {
        id: "group:assets",
        label: "Assets",
        kind: "group",
        amount: 100.01,
        children: [
          {
            id: "account:asset-main",
            label: "Main",
            kind: "account",
            amount: 100,
            children: [],
          },
        ],
      },
    ]);
  });
});
