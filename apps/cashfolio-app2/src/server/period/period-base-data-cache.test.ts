import { toNumericMoney } from "../money-boundary";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";

const redisState = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  sets: new Map<string, Set<string>>(),
}));

const redisClient = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => redisState.kv.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    redisState.kv.set(key, value);
  }),
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    redisState.kv.set(key, value);
  }),
  sAdd: vi.fn(async (key: string, value: string) => {
    const next = redisState.sets.get(key) ?? new Set<string>();
    next.add(value);
    redisState.sets.set(key, next);
  }),
  expire: vi.fn(async () => 1),
  sMembers: vi.fn(async (key: string) =>
    Array.from(redisState.sets.get(key) ?? new Set<string>()),
  ),
  del: vi.fn(async (keys: string[] | string) => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      redisState.kv.delete(key);
      redisState.sets.delete(key);
    }
    return keyList.length;
  }),
}));

const getRedisClient = vi.hoisted(() => vi.fn(async () => redisClient));

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

const loadTransferClearingUnitBuckets = vi.hoisted(() => vi.fn());

vi.mock("../../redis.server", () => ({
  getRedisClient,
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

vi.mock("./period-transfer-clearing", () => ({
  loadTransferClearingUnitBuckets,
}));

import * as periodBaseCache from "../period/period-base-data-cache";

describe("period base-data cache", () => {
  beforeEach(() => {
    redisState.kv.clear();
    redisState.sets.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    process.env.PERIOD_BASE_CACHE_ENV = "preview-app-123";

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockImplementation(
      async (args: { where?: unknown }) => {
        const where = args.where as { type?: unknown } | undefined;
        if (
          where &&
          typeof where.type === "object" &&
          where.type != null &&
          "in" in where.type
        ) {
          return [
            {
              id: "asset-1",
              name: "Cash",
              groupId: null,
              type: AccountType.ASSET,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
            },
          ];
        }
        return [];
      },
    );
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    loadTransferClearingUnitBuckets.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PERIOD_BASE_CACHE_ENV;
  });

  it("loads on miss, stores with env-scoped key, and reuses cached hit", async () => {
    const first = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    const second = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).toContain(
      "period:base:v7:preview-app-123:book-1:0:2026-02",
    );

    expect(first.selection.from).toBeInstanceOf(Date);
    expect(second.selection.from).toBeInstanceOf(Date);
  });

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
      "period:base:v7:preview-app-123:book-1:0:2026-02",
    );
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
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
      "period:base:v7:preview-app-123:book-1:0:2026-02",
    );
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
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
      "period:base:v7:preview-app-123:book-1:0:2026-02",
    );
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("reloads legacy v5 cash-flow bookings without account metadata and caches a usable v7 snapshot", async () => {
    const account = {
      id: "asset-1",
      name: "Cash",
      groupId: "cash-group",
      type: AccountType.ASSET,
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
                account: { type: AccountType.ASSET, isCashAccount: true },
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
        type: AccountType.ASSET,
        isCashAccount: true,
      });
      expect(result.cashFlowTransactions[0]?.bookings[0]?.date).toBeInstanceOf(
        Date,
      );
    }
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(redisClient.get).not.toHaveBeenCalledWith(legacyKey);
    expect(redisClient.setEx).toHaveBeenCalledWith(
      "period:base:v7:preview-app-123:book-1:0:2026-02",
      24 * 60 * 60,
      expect.any(String),
    );
    expect(redisClient.sAdd).toHaveBeenCalledWith(
      "period:base:index:v7:preview-app-123:book-1:0",
      "period:base:v7:preview-app-123:book-1:0:2026-02",
    );
  });

  it("invalidates all cached period entries for one account book in one namespace", async () => {
    redisState.kv.set("period:base:v7:preview-app-123:book-1:0:2026-01", "{}");
    redisState.kv.set("period:base:v7:preview-app-123:book-1:0:2026-02", "{}");
    redisState.kv.set("period:base:v7:preview-app-123:book-2:0:2026-02", "{}");
    redisState.sets.set(
      "period:base:index:v7:preview-app-123:book-1:0",
      new Set([
        "period:base:v7:preview-app-123:book-1:0:2026-01",
        "period:base:v7:preview-app-123:book-1:0:2026-02",
      ]),
    );

    await periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1");

    expect(
      toNumericMoney(
        redisState.kv.has("period:base:v7:preview-app-123:book-1:0:2026-01"),
      ),
    ).toBe(false);
    expect(
      toNumericMoney(
        redisState.kv.has("period:base:v7:preview-app-123:book-1:0:2026-02"),
      ),
    ).toBe(false);
    expect(
      toNumericMoney(
        redisState.kv.has("period:base:v7:preview-app-123:book-2:0:2026-02"),
      ),
    ).toBe(true);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
    expect(toNumericMoney(redisClient.set.mock.calls[0]?.[0])).toBe(
      "period:base:generation:v1:preview-app-123:book-1",
    );
  });

  it("keys preset periods by resolved concrete date range", async () => {
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).toContain(
      "period:base:v7:preview-app-123:book-1:0:month:2026-05-01:2026-05-01",
    );
  });

  it("keys explicit current periods with a UTC-day discriminator", async () => {
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [firstKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(firstKey).toContain(
      "period:base:v7:preview-app-123:book-1:0:2026-05:2026-05-01",
    );

    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-05",
    });
    const [secondKey] = redisClient.setEx.mock.calls[1] ?? [];
    expect(secondKey).toContain(
      "period:base:v7:preview-app-123:book-1:0:2026-05:2026-05-02",
    );
  });

  it("does not perform extra account-book reads for month preset cache hits", async () => {
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });
    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent misses before awaiting cache-key/redis work", async () => {
    redisClient.get.mockImplementation(async (key: string) => {
      await Promise.resolve();
      return redisState.kv.get(key) ?? null;
    });

    await Promise.all([
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
      }),
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
      }),
    ]);

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("does not share inflight preset loads across UTC-day boundaries", async () => {
    let releaseGet: (() => void) | undefined;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    redisClient.get.mockImplementation(async (key: string) => {
      await getGate;
      return redisState.kv.get(key) ?? null;
    });

    const first = periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });
    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
    const second = periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    releaseGet?.();
    await Promise.all([first, second]);

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  });

  it("switches generation after invalidation so old entries are not reused", async () => {
    redisState.kv.set(
      "period:base:v7:preview-app-123:book-1:0:month:2026-05-01:2026-05-01",
      JSON.stringify({ cached: true }),
    );
    redisState.sets.set(
      "period:base:index:v7:preview-app-123:book-1:0",
      new Set([
        "period:base:v7:preview-app-123:book-1:0:month:2026-05-01:2026-05-01",
      ]),
    );

    await periodBaseCache.invalidatePeriodBaseDataCacheForAccountBook("book-1");

    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    const [entryKey] = redisClient.setEx.mock.calls[0] ?? [];
    expect(entryKey).not.toContain(":0:month:2026-05-01:2026-05-01");
  });

  it("throws when redis is available but PERIOD_BASE_CACHE_ENV is missing", async () => {
    delete process.env.PERIOD_BASE_CACHE_ENV;

    await expect(
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
      }),
    ).rejects.toThrow(/PERIOD_BASE_CACHE_ENV/);
  });

  it("fails open when redis read fails", async () => {
    redisClient.get.mockRejectedValueOnce(new Error("redis read failed"));

    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result.periodValue)).toBe("2026-02");
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("skips cache write for oversized payloads", async () => {
    prisma.account.findMany.mockImplementation(
      async (args: { where?: unknown }) => {
        const where = args.where as { type?: unknown } | undefined;
        if (
          where &&
          typeof where.type === "object" &&
          where.type != null &&
          "in" in where.type
        ) {
          return [
            {
              id: "asset-1",
              name: "x".repeat(2_300_000),
              groupId: null,
              type: AccountType.ASSET,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
            },
          ];
        }
        return [];
      },
    );

    await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(redisClient.setEx).not.toHaveBeenCalled();
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

  it("ignores numeric v6 snapshots and reloads invalid decimal v7 payloads", async () => {
    redisState.kv.set(
      "period:base:v6:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ periodValue: "stale" }),
    );
    redisState.kv.set(
      "period:base:v7:preview-app-123:book-1:0:2026-02",
      JSON.stringify({ amount: { __cashfolioDecimal: "Infinity" } }),
    );
    const result = await periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(result.periodValue).toBe("2026-02");
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
  });
});
