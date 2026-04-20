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
const getCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getCryptocurrencyToCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getSecurityToCurrencyExchangeRate = vi.hoisted(() => vi.fn());

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
    findMany: vi.fn(),
    groupBy: vi.fn(),
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

vi.mock("./valuation.server", () => ({
  getCurrencyExchangeRate,
  getCryptocurrencyToCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
}));

import { getPeriodOverview } from "./period";

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

    getCurrencyExchangeRate.mockResolvedValue(1);
    getCryptocurrencyToCurrencyExchangeRate.mockResolvedValue(null);
    getSecurityToCurrencyExchangeRate.mockResolvedValue(null);
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
    expect(result.stats.transactionGainLoss).toBe(0);
    expect(result.stats.holdingGainLoss).toBe(0);
    expect(result.stats.endOfPeriodAssets).toBe(100);
    expect(result.stats.endOfPeriodLiabilities).toBe(0);
    expect(result.stats.endOfPeriodNetWorth).toBe(100);
    expect(result.expenseBreakdown.items).toEqual([]);
    expect(result.incomeBreakdown.items).toEqual([]);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("excludes opening-balance transactions in transaction and holding contribution queries", async () => {
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
    prisma.booking.groupBy.mockImplementation((args) => {
      if (args.where?.transaction) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    await getPeriodOverview({
      data: { accountBookId: "book-2", period: "2026-02" },
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
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
      ([args]) => args.where?.transaction,
    );
    expect(holdingBalanceGroupByCall).toBeTruthy();
    expect(holdingBalanceGroupByCall?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          transaction: {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
        }),
      }),
    );

    const holdingBookingsFindManyCall = prisma.booking.findMany.mock.calls.find(
      ([args]) => args.where?.transaction,
    );
    expect(holdingBookingsFindManyCall).toBeTruthy();
    expect(holdingBookingsFindManyCall?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          transaction: {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
        }),
      }),
    );
  });
});
