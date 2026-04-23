import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

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
const convertBookingValueToReference = vi.hoisted(() => vi.fn());
const getUnitToReferenceExchangeRate = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
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

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));

import { DEFAULT_PERIOD_VALUE, getPeriodOverview } from "./period";

describe("getPeriodOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-08T00:00:00.000Z"),
    });
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-chf",
        name: "Cash",
        groupId: null,
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);

    convertBookingValueToReference.mockImplementation(
      async ({ value }) => value,
    );
    getUnitToReferenceExchangeRate.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses accountBook.startDate as the first selectable period floor", async () => {
    vi.setSystemTime(new Date("2026-01-08T12:00:00.000Z"));
    prisma.booking.groupBy.mockResolvedValueOnce([
      { accountId: "asset-chf", _sum: { value: 100 } },
    ]);

    const result = await getPeriodOverview({
      data: { accountBookId: "book-1", period: "mtd" },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(result.minBookingDate).toBe("2026-01-08T00:00:00.000Z");
    expect(result.stats.totalReturn).toBe(0);
    expect(result.stats.savings).toBe(0);
    expect(result.stats.income).toBe(0);
    expect(result.stats.expenses).toBe(0);
    expect(result.stats.gainsLosses).toBe(0);
    expect(result.stats.explicitGainLoss).toBe(0);
    expect(result.stats.realizedGainLoss).toBe(0);
    expect(result.stats.unrealizedGainLoss).toBe(0);
    expect(result.stats.endOfPeriodAssets).toBe(100);
    expect(result.stats.endOfPeriodLiabilities).toBe(0);
    expect(result.stats.endOfPeriodNetWorth).toBe(100);
    expect(result.expenseBreakdown.items).toEqual([]);
    expect(result.incomeBreakdown.items).toEqual([]);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("excludes opening-balance transactions for transaction contributions without filtering holding balances", async () => {
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-holding",
        name: "AAPL",
        groupId: null,
        type: AccountType.ASSET,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (args.where?.account?.type === AccountType.EQUITY) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    prisma.booking.groupBy.mockResolvedValue([]);

    await getPeriodOverview({
      data: { accountBookId: "book-2", period: "2026-02" },
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              bookings: {
                some: {
                  accountId: {
                    in: ["asset-holding"],
                  },
                  date: {
                    gte: new Date("2026-02-01T00:00:00.000Z"),
                    lt: new Date("2026-03-01T00:00:00.000Z"),
                  },
                },
              },
            }),
            expect.objectContaining({
              bookings: {
                none: {
                  account: {
                    type: AccountType.EQUITY,
                    equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                  },
                },
              },
            }),
          ]),
        }),
      }),
    );

    const holdingBalanceGroupByCall = prisma.booking.groupBy.mock.calls.find(
      ([args]) =>
        Array.isArray(args.where?.accountId?.in) &&
        args.where.accountId.in.includes("asset-holding") &&
        args.where?.date?.lt,
    );
    expect(holdingBalanceGroupByCall).toBeTruthy();
    expect(holdingBalanceGroupByCall?.[0].where?.transaction).toBeUndefined();
  });

  it("returns a zeroed overview when no bookings are present", async () => {
    vi.setSystemTime(new Date("2026-05-10T10:00:00.000Z"));
    prisma.account.findMany.mockResolvedValue([]);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-empty",
        period: "2026-01",
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-empty");
    expect(result.selectedPeriodValue).toBe("2026-01");
    expect(result.stats).toMatchObject({
      totalReturn: 0,
      savings: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      endOfPeriodNetWorth: 0,
      endOfPeriodAssets: 0,
      endOfPeriodLiabilities: 0,
    });
    expect(result.bookingsCount).toBe(0);
    expect(result.convertedBookingsCount).toBe(0);
    expect(result.skippedBookingsCount).toBe(0);
    expect(result.expenseBreakdown.items).toEqual([]);
    expect(result.incomeBreakdown.items).toEqual([]);
    expect(result.assetBreakdown.items).toEqual([]);
    expect(result.liabilityBreakdown.items).toEqual([]);
  });

  it("tracks converted/skipped counts across equity conversions", async () => {
    vi.setSystemTime(new Date("2026-05-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: "booking-income",
        date: new Date("2026-01-10T00:00:00.000Z"),
        value: -100,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: {
          id: "income-1",
          name: "Income",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      },
      {
        id: "booking-expense-no-rate",
        date: new Date("2026-01-11T00:00:00.000Z"),
        value: 60,
        unit: Unit.CURRENCY,
        currency: "XXX",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: {
          id: "expense-1",
          name: "Expense",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        },
      },
      {
        id: "booking-gain-loss",
        date: new Date("2026-01-12T00:00:00.000Z"),
        value: -20,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: {
          id: "gainloss-1",
          name: "GainLoss",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      },
    ]);
    convertBookingValueToReference.mockImplementation(async ({ value }) => {
      if (value === 60) {
        return null;
      }
      return value;
    });

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-1",
        period: "2026-01",
      },
    });

    expect(result.bookingsCount).toBe(3);
    expect(result.convertedBookingsCount).toBe(2);
    expect(result.skippedBookingsCount).toBe(1);
    expect(result.stats).toMatchObject({
      income: 100,
      expenses: 0,
      explicitGainLoss: 20,
      realizedGainLoss: 20,
      unrealizedGainLoss: 0,
      gainsLosses: 20,
      savings: 100,
      totalReturn: 120,
    });
    expect(result.incomeBreakdown.totalAmount).toBe(100);
    expect(result.expenseBreakdown.totalAmount).toBe(0);
    expect(convertBookingValueToReference).toHaveBeenCalled();
    expect(getUnitToReferenceExchangeRate).not.toHaveBeenCalled();
  });

  it("computes FIFO realized/unrealized gains for holding transactions", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-holding",
        name: "AAPL",
        groupId: null,
        type: AccountType.ASSET,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.groupBy
      .mockResolvedValueOnce([
        { accountId: "asset-holding", _sum: { value: 3 } },
      ])
      .mockResolvedValueOnce([
        { accountId: "asset-holding", _sum: { value: 0 } },
      ]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        {
          id: "tx-buy",
          bookings: [
            {
              id: "b-hold-buy",
              accountId: "asset-holding",
              date: new Date("2026-01-10T00:00:00.000Z"),
              value: 5,
              unit: Unit.SECURITY,
              currency: null,
              cryptocurrency: null,
              symbol: "AAPL",
              tradeCurrency: "USD",
              account: {
                type: AccountType.ASSET,
                equityAccountSubtype: null,
              },
            },
            {
              id: "b-cash-buy",
              accountId: "asset-cash",
              date: new Date("2026-01-10T00:00:00.000Z"),
              value: -700,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                type: AccountType.ASSET,
                equityAccountSubtype: null,
              },
            },
          ],
        },
        {
          id: "tx-sell",
          bookings: [
            {
              id: "b-hold-sell",
              accountId: "asset-holding",
              date: new Date("2026-01-20T00:00:00.000Z"),
              value: -2,
              unit: Unit.SECURITY,
              currency: null,
              cryptocurrency: null,
              symbol: "AAPL",
              tradeCurrency: "USD",
              account: {
                type: AccountType.ASSET,
                equityAccountSubtype: null,
              },
            },
            {
              id: "b-cash-sell",
              accountId: "asset-cash",
              date: new Date("2026-01-20T00:00:00.000Z"),
              value: 300,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                type: AccountType.ASSET,
                equityAccountSubtype: null,
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    convertBookingValueToReference.mockImplementation(async ({ value }) => {
      if (value === 5) return 700;
      if (value === -700) return -700;
      if (value === -2) return -260;
      if (value === 300) return 300;
      if (value === 3) return 390;
      return value;
    });
    getUnitToReferenceExchangeRate.mockResolvedValue(130);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-1",
        period: "2026-01",
      },
    });

    expect(result.convertedBookingsCount).toBe(4);
    expect(result.skippedBookingsCount).toBe(0);
    expect(result.stats).toMatchObject({
      income: 0,
      expenses: 0,
      savings: 0,
      explicitGainLoss: 0,
      realizedGainLoss: 20,
      unrealizedGainLoss: -30,
      gainsLosses: -10,
      totalReturn: -10,
      endOfPeriodAssets: 390,
    });
    expect(getUnitToReferenceExchangeRate).toHaveBeenCalled();
  });

  it("ignores unsupported period values in input and falls back to default", async () => {
    vi.setSystemTime(new Date("2026-05-10T10:00:00.000Z"));

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-default-period",
        period: "not-a-real-period",
      },
    });

    expect(result.selectedPeriodValue).toBe(DEFAULT_PERIOD_VALUE);
  });
});
