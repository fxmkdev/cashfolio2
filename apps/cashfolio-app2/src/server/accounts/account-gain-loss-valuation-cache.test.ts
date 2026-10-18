import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountGainLossCacheEntryKey } from "../../shared/book-cache-keys";
import { getSecurityRedisSeriesKey } from "../valuation/keys";

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  series: new Map<string, Map<number, number>>(),
  db: {
    $executeRaw: vi.fn(),
    accountBook: { findUniqueOrThrow: vi.fn() },
    account: { findMany: vi.fn() },
    accountGroup: { findMany: vi.fn() },
    booking: { groupBy: vi.fn(), findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
  snapshot: vi.fn(),
  securityProvider: vi.fn(),
  currencyProvider: vi.fn(),
  cryptoProvider: vi.fn(),
}));
const redis = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => mocks.values.get(key) ?? null),
  exists: vi.fn(async (key: string) =>
    Number(mocks.values.has(key) || mocks.series.has(key)),
  ),
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    mocks.values.set(key, value);
  }),
  del: vi.fn(async (key: string) => Number(mocks.values.delete(key))),
  ts: {
    range: vi.fn(async (key: string, from: number, to: number) =>
      [...(mocks.series.get(key) ?? [])]
        .filter(([timestamp]) => timestamp >= from && timestamp <= to)
        .map(([timestamp, value]) => ({ timestamp, value })),
    ),
    revRange: vi.fn(async (key: string, _from: string, to: number) =>
      [...(mocks.series.get(key) ?? [])]
        .filter(([timestamp]) => timestamp <= to)
        .sort(([a], [b]) => b - a)
        .slice(0, 1)
        .map(([timestamp, value]) => ({ timestamp, value })),
    ),
    add: vi.fn(async (key: string, timestamp: number, value: number) => {
      const points = mocks.series.get(key) ?? new Map<number, number>();
      points.set(timestamp, value);
      mocks.series.set(key, points);
    }),
  },
}));
vi.mock("../../prisma.server", () => ({
  prisma: { ...mocks.db, $transaction: mocks.snapshot },
}));
vi.mock("../../redis.server", () => ({ getRedisClient: async () => redis }));
vi.mock("../valuation/providers", () => ({
  fetchSecurityPriceFromMarketstack: mocks.securityProvider,
  fetchUsdToCurrencyRateFromCurrencyLayer: mocks.currencyProvider,
  fetchUsdPerCryptocurrencyRateFromCoinLayer: mocks.cryptoProvider,
}));
import {
  queryAccountGainLoss,
  queryAccountGainLossSummaries,
} from "./account-gain-loss.server";

const seriesKey = getSecurityRedisSeriesKey("TEST", "USD");
const summaryKey = getAccountGainLossCacheEntryKey({
  cacheEnv: "test",
  accountBookId: "book",
  generation: "revision",
  asOfDate: "2026-05-12",
  latestFetchableDate: "2026-05-11",
});
const list = () =>
  queryAccountGainLossSummaries({
    accountBookId: "book",
    type: "ASSET",
    accountState: "active",
  });
const ledger = () =>
  queryAccountGainLoss({
    accountBookId: "book",
    accountId: "holding",
    includeDetails: true,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-12T12:00:00Z"));
  vi.stubEnv("PERIOD_BASE_CACHE_ENV", "test");
  mocks.values.clear();
  mocks.series.clear();
  mocks.series.set(
    seriesKey,
    new Map([
      [Date.UTC(2026, 3, 30), 100],
      [Date.UTC(2026, 4, 8), 110],
    ]),
  );
  mocks.snapshot.mockImplementation(async (read) => read(mocks.db));
  mocks.db.accountBook.findUniqueOrThrow.mockResolvedValue({
    referenceCurrency: "USD",
    startDate: new Date("2026-05-01Z"),
    periodCacheRevision: "revision",
  });
  mocks.db.account.findMany.mockResolvedValue([
    {
      id: "holding",
      name: "Holding",
      type: "ASSET",
      isActive: true,
      groupId: null,
      unit: "SECURITY",
      symbol: "TEST",
      tradeCurrency: "USD",
      currency: null,
      cryptocurrency: null,
    },
  ]);
  mocks.db.accountGroup.findMany.mockResolvedValue([]);
  mocks.db.booking.groupBy.mockResolvedValue([
    { accountId: "holding", _sum: { value: "1" } },
  ]);
  mocks.db.booking.findMany.mockResolvedValue([]);
  mocks.db.transaction.findMany.mockResolvedValue([]);
  mocks.securityProvider.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("summary persistence with real FIFO and valuation backtracking", () => {
  it("does not freeze an older quote when a newer quote arrives without changing the revision or dates", async () => {
    const first = await list();
    expect(first.total.summary.totalGainLoss).toBe(10);
    expect(mocks.securityProvider).toHaveBeenCalledTimes(3);
    expect(mocks.values.has(summaryKey)).toBe(false);
    expect((await ledger()).summary.totalGainLoss).toBe(10);
    expect(mocks.values.has(summaryKey)).toBe(false);

    // Another request populates the newly available quote in the shared series.
    mocks.series.get(seriesKey)!.set(Date.UTC(2026, 4, 11), 120);
    const refreshed = await list();
    const details = await ledger();
    expect(refreshed.total.summary.totalGainLoss).toBe(20);
    expect(details.summary.totalGainLoss).toBe(20);
    expect(details.unrealizedOpenLots[0]!.unrealizedGainLoss).toBe(20);
    expect(mocks.values.has(summaryKey)).toBe(true);
    expect(mocks.securityProvider).toHaveBeenCalledTimes(3);

    const snapshots = mocks.snapshot.mock.calls.length;
    const valuationReads = redis.ts.range.mock.calls.length;
    expect(await list()).toEqual(refreshed);
    expect(mocks.snapshot).toHaveBeenCalledTimes(snapshots);
    expect(redis.ts.range).toHaveBeenCalledTimes(valuationReads);
  });
});
