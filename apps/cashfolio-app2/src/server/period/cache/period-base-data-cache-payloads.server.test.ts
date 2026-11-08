import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toNumericMoney } from "../../money-boundary";
import {
  cleanupBaseDataCache,
  periodBaseCache,
  prisma,
  redisClient,
  redisState,
  resetBaseDataCache,
} from "./period-base-data-cache.server.test-support";

describe("period base-data cache", () => {
  beforeEach(resetBaseDataCache);
  afterEach(cleanupBaseDataCache);

  it.each([
    [
      "missing collections",
      (value: Record<string, any>) => {
        delete value.equityBookings;
      },
    ],
    [
      "invalid nested money",
      (value: Record<string, any>) => {
        value.endOfPeriodRawBalances = [
          { accountId: "asset-1", rawBalance: 12 },
        ];
      },
    ],
    [
      "invalid nested date",
      (value: Record<string, any>) => {
        value.selection.from = "2026-02-01";
      },
    ],
    [
      "invalid account flag",
      (value: Record<string, any>) => {
        value.baseAssetLiabilityAccounts[0].isCashAccount = "false";
      },
    ],
    [
      "invalid unit",
      (value: Record<string, any>) => {
        value.baseAssetLiabilityAccounts[0].unit = "UNKNOWN";
      },
    ],
    [
      "wrong book",
      (value: Record<string, any>) => {
        value.accountBookId = "another-book";
      },
    ],
    [
      "wrong period",
      (value: Record<string, any>) => {
        value.periodValue = "2026-01";
      },
    ],
  ])(
    "reloads %s cache payloads instead of returning invalid data",
    async (_label, corrupt) => {
      const input = { accountBookId: "book-1", period: "2026-02" };
      const cold = await periodBaseCache.getOrLoadPeriodBaseData(input);
      const [key, , encoded] = redisClient.setEx.mock.calls[0]!;
      const payload = JSON.parse(encoded);
      corrupt(payload);
      redisState.kv.set(key, JSON.stringify(payload));
      prisma.accountGroup.findMany.mockClear();
      expect(await periodBaseCache.getOrLoadPeriodBaseData(input)).toEqual(
        cold,
      );
      expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    },
  );

  it("ignores stale v2 entries written before cash-flow transactions were cached", async () => {
    redisState.kv.set(
      "period:base:v2:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ periodValue: "stale-v2" }),
    );

    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result.periodValue)).toBe("2026-02");
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:base:v12:preview-app-123:book-1:0:2026-02",
    );
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
  });

  it("ignores stale v3 entries computed before legacy cash-account fallback", async () => {
    redisState.kv.set(
      "period:base:v3:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ periodValue: "stale-v3", cashFlowTransactions: [] }),
    );

    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result.periodValue)).toBe("2026-02");
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:base:v12:preview-app-123:book-1:0:2026-02",
    );
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
  });

  it("ignores stale v4 entries computed with legacy cash-account fallback", async () => {
    redisState.kv.set(
      "period:base:v4:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ periodValue: "stale-v4", cashFlowTransactions: [] }),
    );

    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result.periodValue)).toBe("2026-02");
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:base:v12:preview-app-123:book-1:0:2026-02",
    );
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
  });

  it("reloads legacy v5 cash-flow bookings without account metadata and caches a usable v7 snapshot", async () => {
    const account = {
      id: "asset-1",
      name: "Cash",
      groupId: "cash-group",
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isCashAccount: true,
    };
    const booking = {
      id: "booking-1",
      accountId: account.id,
      date: new Date("2026-02-10T00:00:00.000Z"),
      value: 100,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      account,
    };
    prisma.account.findMany.mockResolvedValueOnce([account]);
    prisma.transaction.findMany.mockResolvedValue([
      { id: "tx-1", bookings: [booking] },
    ]);
    const legacyKey = "period:base:v5:preview-app-123:book-1:0:2026-02";
    redisState.kv.set(
      legacyKey,
      JSON.stringify({
        periodValue: "2026-02",
        cashFlowTransactions: [
          {
            id: "tx-1",
            bookings: [
              {
                ...booking,
                account: { type: AccountType.BALANCE, isCashAccount: true },
              },
            ],
          },
        ],
      }),
    );

    const first = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    const second = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    for (const result of [first, second]) {
      expect(
        toNumericMoney(result.cashFlowTransactions[0]?.bookings[0]?.account),
      ).toEqual({
        id: "asset-1",
        name: "Cash",
        groupId: "cash-group",
        type: AccountType.BALANCE,
        isCashAccount: true,
      });
      expect(result.cashFlowTransactions[0]?.bookings[0]?.date).toBeInstanceOf(
        Date,
      );
    }
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    expect(redisClient.get).not.toHaveBeenCalledWith(legacyKey);
    expect(redisClient.setEx).toHaveBeenCalledWith(
      "period:base:v12:preview-app-123:book-1:0:2026-02",
      24 * 60 * 60,
      expect.any(String),
    );
    expect(redisClient.sAdd).toHaveBeenCalledWith(
      "period:base:index:v12:preview-app-123:book-1:0",
      "period:base:v12:preview-app-123:book-1:0:2026-02",
    );
  });

  it("preserves high-precision database balances and dates on cold and warm reads", async () => {
    const exact = "9007199254740993.123456789123456789";
    prisma.booking.groupBy.mockResolvedValue([
      { accountId: "asset-1", _sum: { value: { toString: () => exact } } },
    ]);
    const input = { accountBookId: "book-1", period: "2026-02" };
    const cold = await periodBaseCache.getOrLoadPeriodBaseData(input);
    const warm = await periodBaseCache.getOrLoadPeriodBaseData(input);
    expect(warm).toEqual(cold);
    expect(warm.endOfPeriodRawBalances[0]!.rawBalance.toString()).toBe(exact);
    expect(warm.selection.from).toBeInstanceOf(Date);
    const stored = JSON.parse(redisClient.setEx.mock.calls[0]![2]);
    expect(stored.endOfPeriodRawBalances[0].rawBalance).toEqual({
      __cashfolioDecimal: exact,
    });
  });

  it("caches complete residual inputs with dates and Decimal precision and reloads after revision changes", async () => {
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: "residual",
        bookings: [
          {
            id: "booking",
            accountId: "expense-usd",
            date: new Date("2026-01-31"),
            value: { toString: () => "123.123456789123456789" },
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: { name: "Expense" },
          },
        ],
      },
    ]);
    const input = { accountBookId: "book-1", period: "2026-02" };
    const cold = await periodBaseCache.getOrLoadPeriodBaseData(input);
    prisma.transaction.findMany.mockClear();
    const warm = await periodBaseCache.getOrLoadPeriodBaseData(input);
    expect(warm.executionResidualTransactions).toEqual(
      cold.executionResidualTransactions,
    );
    const booking = warm.executionResidualTransactions[0]!.bookings[0]!;
    expect(booking.date).toBeInstanceOf(Date);
    expect(booking.value.toString()).toBe("123.123456789123456789");
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      periodCacheRevision: "1",
      startDate: new Date("2026-01-01"),
    });
    await periodBaseCache.getOrLoadPeriodBaseData(input);
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
  });

  it("bypasses v7 snapshots without residual inputs", async () => {
    redisState.kv.set(
      "period:base:v7:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ periodValue: "stale" }),
    );
    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(result.executionResidualTransactions).toEqual([]);
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
    expect(redisClient.setEx.mock.calls[0]![0]).toBe(
      "period:base:v12:preview-app-123:book-1:0:2026-02",
    );
  });

  it("does not load residual candidates before the account-book start", async () => {
    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "last-year",
    });
    expect(result.executionResidualTransactions).toEqual([]);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("ignores numeric v6 snapshots and reloads invalid decimal v8 payloads", async () => {
    redisState.kv.set(
      "period:base:v6:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ periodValue: "stale" }),
    );
    redisState.kv.set(
      "period:base:v12:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ amount: { __cashfolioDecimal: "Infinity" } }),
    );
    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(result.periodValue).toBe("2026-02");
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
  });
});
