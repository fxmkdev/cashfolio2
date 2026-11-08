import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import {
  cleanupOverview,
  convertBookingValueToReference,
  getPeriodOverview,
  getUnitToReferenceExchangeRate,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
  transactionFilterIncludes,
} from "./period-overview.test-support";
describe("getPeriodOverview", () => {
  beforeEach(resetOverview);
  afterEach(cleanupOverview);

  it("excludes opening-balance transactions for transaction contributions without filtering holding balances", async () => {
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
    prisma.account.findMany
      .mockResolvedValueOnce([
        {
          id: "asset-holding",
          name: "AAPL",
          groupId: null,
          type: AccountType.BALANCE,
          unit: Unit.SECURITY,
          currency: null,
          cryptocurrency: null,
          symbol: "AAPL",
          tradeCurrency: "USD",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "opening",
          name: "Opening Balances",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
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
                  accountId: { in: ["opening"] },
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

  it("excludes opening-balance transactions from cash flow in the account-book start period", async () => {
    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
    prisma.account.findMany
      .mockResolvedValueOnce([
        {
          id: "asset-cash",
          name: "Cash",
          groupId: null,
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          isCashAccount: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "opening",
          name: "Opening Balances",
          groupId: null,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      ]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);

    await getPeriodOverview({
      data: { accountBookId: "book-2", period: "2026-01" },
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              bookings: {
                some: {
                  accountId: {
                    in: ["asset-cash"],
                  },
                  date: {
                    gte: new Date("2026-01-01T00:00:00.000Z"),
                    lt: new Date("2026-02-01T00:00:00.000Z"),
                  },
                },
              },
            }),
            expect.objectContaining({
              bookings: {
                none: {
                  accountId: { in: ["opening"] },
                },
              },
            }),
          ]),
        }),
      }),
    );
  });

  it("does not treat legacy currency asset accounts as cash without the cash flag", async () => {
    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-cash",
        name: "Cash",
        groupId: null,
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isCashAccount: false,
      },
    ]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([
      { accountId: "asset-cash", _sum: { value: 250 } },
    ]);

    const result = await getPeriodOverview({
      data: { accountBookId: "book-legacy-cash", period: "2026-01" },
    });

    expect(result.hasCashAccounts).toBe(false);
    expect(result.stats.cashFlow).toBe(0);
    const cashFlowTransactionQuery =
      prisma.transaction.findMany.mock.calls.find(([args]) =>
        JSON.stringify(args).includes('"accountId":{"in":["asset-cash"]}'),
      );
    expect(cashFlowTransactionQuery).toBeUndefined();
  });

  it("tracks converted/skipped counts across equity conversions", async () => {
    vi.setSystemTime(new Date("2026-05-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (transactionFilterIncludes(args.where?.transactionId, "tx-explicit")) {
        return Promise.resolve([
          {
            transactionId: "tx-explicit",
            accountId: "asset-counterpart",
            account: {
              name: "Cash",
            },
          },
        ]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "booking-income",
          transactionId: "tx-income",
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
          transactionId: "tx-expense",
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
          transactionId: "tx-explicit",
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
    });
    convertBookingValueToReference.mockImplementation(async ({ value }) => {
      if (toMoney(value).equals(60)) {
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
      realizedGainLoss: 0,
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
});
