import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moneyMultiply, toMoney } from "../../shared/money";
import { decodeMoneyCache, encodeMoneyCache } from "../money-cache-codec";
import type { ValuationRateSource } from "../valuation/types";

const mocks = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  redis: vi.fn(),
  snapshot: vi.fn(),
  db: {
    $executeRaw: vi.fn(),
    accountBook: { findUniqueOrThrow: vi.fn() },
    account: { findMany: vi.fn() },
    accountGroup: { findMany: vi.fn() },
    booking: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
  rate: vi.fn(),
  conversion: vi.fn(),
}));
vi.mock("../../prisma.server", () => ({
  prisma: { ...mocks.db, $transaction: mocks.snapshot },
}));
vi.mock("../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../period/period-conversion", () => ({
  getUnitToReferenceExchangeRateDetails: mocks.rate,
  convertBookingValueToReferenceDetails: mocks.conversion,
}));
import { loadAccountGainLossSummaryRange } from "./account-gain-loss-basis-cache.server";
import {
  queryAccountGainLoss,
  queryAccountGainLossSummaries,
} from "./account-gain-loss.server";
import { isAccountGainLossBasisCacheData } from "./account-gain-loss-basis-cache-data";

const redis = {
  get: vi.fn(async (key: string) => mocks.entries.get(key) ?? null),
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    mocks.entries.set(key, value);
  }),
};
const holding = {
  id: "holding",
  name: "Holding",
  type: "ASSET",
  isActive: true,
  groupId: "group",
  unit: "SECURITY",
  currency: null,
  cryptocurrency: null,
  symbol: "TEST",
  tradeCurrency: "CHF",
};
const book = {
  referenceCurrency: "CHF",
  startDate: new Date("2026-01-01Z"),
  periodCacheRevision: "revision",
};
function trade(id: string, day: string, quantity: string, proceeds: string) {
  const date = new Date(day);
  return {
    id,
    description: id,
    bookings: [
      {
        ...holding,
        id: `${id}:holding`,
        accountId: holding.id,
        date,
        value: quantity,
        description: null,
        account: { type: "ASSET", equityAccountSubtype: null },
      },
      {
        id: `${id}:cash`,
        accountId: "cash",
        date,
        value: proceeds,
        description: null,
        unit: "CURRENCY",
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: { type: "ASSET", equityAccountSubtype: null },
      },
    ],
  };
}
const buy = trade("buy", "2026-02-02Z", "1", "-110");
const sell = trade("sell", "2026-03-03Z", "-1", "140");
let transactions = [buy, sell];
let closingRate: number | null;
let basisSource: ValuationRateSource;
let closingSource: ValuationRateSource;
const basisKey =
  "account:gain-loss-basis:v3:test:book:revision:2026-03-03T00:00:00.000Z";
const load = (date = "2026-05-12Z") =>
  loadAccountGainLossSummaryRange({
    accountBookId: "book",
    asOfDate: new Date(date),
  });
const list = () =>
  queryAccountGainLossSummaries({
    accountBookId: "book",
    type: "ASSET",
    accountState: "active",
  });
const ledger = (includeDetails = false, period?: string) =>
  queryAccountGainLoss({
    accountBookId: "book",
    accountId: "holding",
    includeDetails,
    period,
  });
function readPayload() {
  return JSON.parse(mocks.entries.get(basisKey)!);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-12T12:00:00Z"));
  vi.stubEnv("PERIOD_BASE_CACHE_ENV", "test");
  mocks.entries.clear();
  transactions = [buy, sell];
  closingRate = 160;
  basisSource = "timeSeries";
  closingSource = "fallback";
  mocks.redis.mockResolvedValue(redis);
  mocks.snapshot.mockImplementation(async (read) => read(mocks.db));
  mocks.db.accountBook.findUniqueOrThrow.mockResolvedValue(book);
  mocks.db.account.findMany.mockResolvedValue([holding]);
  mocks.db.accountGroup.findMany.mockResolvedValue([
    { id: "group", parentGroupId: null, type: "ASSET", isActive: true },
  ]);
  mocks.db.booking.groupBy.mockResolvedValue([
    { accountId: "holding", _sum: { value: "2" } },
  ]);
  mocks.db.booking.findMany.mockResolvedValue([]);
  mocks.db.booking.findFirst.mockImplementation(async ({ where }) => {
    const dates = transactions
      .flatMap((tx) => tx.bookings.map((b) => b.date))
      .filter((d) => d < where.date.lt);
    return dates.length
      ? { date: new Date(Math.max(...dates.map((d) => d.getTime()))) }
      : null;
  });
  mocks.db.transaction.findMany.mockImplementation(async ({ where }) => {
    const range = where.AND[0].bookings.some.date;
    return transactions.filter(
      (tx) =>
        tx.bookings.every((b) => b.date < range.lt) &&
        tx.bookings.some((b) => b.date >= range.gte),
    );
  });
  mocks.rate.mockImplementation(async ({ date }) =>
    date.getTime() === Date.parse("2025-12-31Z")
      ? { rate: toMoney("100"), source: basisSource }
      : {
          rate: closingRate === null ? null : toMoney(closingRate),
          source: closingRate === null ? "missing" : closingSource,
        },
  );
  mocks.conversion.mockImplementation(async (booking) => ({
    value: moneyMultiply(booking.value, booking.currency === "CHF" ? 1 : 100),
    source: booking.currency === "CHF" ? "identity" : basisSource,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("historical G/L basis cache through the real FIFO calculation", () => {
  it("shares exact basis between Accounts and ledger summaries, refreshes closing prices, and leaves drawers independent", async () => {
    const first = await list();
    expect(first.total.summary).toEqual({
      realizedGainLoss: 40,
      unrealizedGainLoss: 110,
      totalGainLoss: 150,
    });
    expect(redis.setEx).toHaveBeenCalledWith(
      basisKey,
      604800,
      expect.any(String),
    );
    const payload = mocks.entries.get(basisKey)!;
    expect(payload).not.toContain("transactionDescription");
    expect(payload).not.toContain("processedExecutionEvents");
    expect(payload).not.toContain("periodEndRate");
    expect(payload).not.toContain("realizedEvents");
    const historyReads = mocks.db.transaction.findMany.mock.calls.length;
    const metadataReads = mocks.db.account.findMany.mock.calls.length;
    const conversions = mocks.conversion.mock.calls.length;
    closingRate = 180;
    const summary = await ledger();
    expect(summary.summary).toEqual({
      realizedGainLoss: 40,
      unrealizedGainLoss: 150,
      totalGainLoss: 190,
    });
    expect(summary.realizedEvents).toEqual([]);
    expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(historyReads);
    expect(mocks.db.account.findMany).toHaveBeenCalledTimes(metadataReads);
    expect(mocks.conversion).toHaveBeenCalledTimes(conversions);
    expect(mocks.entries.get(basisKey)).toBe(payload);
    const drawer = await ledger(true);
    expect(drawer.summary).toEqual(summary.summary);
    expect(drawer.realizedEvents).toHaveLength(2);
    expect(drawer.unrealizedOpenLots).toHaveLength(2);
    expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(
      historyReads + 1,
    );
    expect((await list()).total.summary).toEqual(summary.summary);
  });

  it.each(["short", "closed", "atomic transfer", "multi-day transfer"])(
    "keeps cached %s results equal to independent drawer replay",
    async (scenario) => {
      const source = {
        ...holding,
        id: "source",
        name: "Archived source",
        isActive: false,
      };
      if (scenario === "short") {
        mocks.db.booking.groupBy.mockResolvedValue([
          { accountId: "holding", _sum: { value: "-3" } },
        ]);
        transactions = [trade("cover", "2026-02-02Z", "1", "-80")];
      } else if (scenario === "closed") {
        mocks.db.booking.groupBy.mockResolvedValue([
          { accountId: "holding", _sum: { value: "1" } },
        ]);
        transactions = [sell];
      } else {
        mocks.db.account.findMany.mockResolvedValue([holding, source]);
        mocks.db.booking.groupBy.mockResolvedValue([
          { accountId: "source", _sum: { value: "3" } },
        ]);
        const outgoing = {
          ...trade("transfer", "2026-02-02Z", "-2", "0").bookings[0]!,
          accountId: "source",
        };
        const incoming = trade(
          "receipt",
          scenario === "atomic transfer" ? "2026-02-02Z" : "2026-02-04Z",
          "2",
          "0",
        ).bookings[0]!;
        const sourceSale = trade("source-sale", "2026-02-03Z", "-1", "120");
        sourceSale.bookings[0]!.accountId = "source";
        transactions = [
          {
            id: "transfer",
            description: "transfer",
            bookings: [outgoing, incoming],
          },
          sourceSale,
          sell,
        ];
      }
      const first = await ledger();
      const historyReads = mocks.db.transaction.findMany.mock.calls.length;
      const second = await ledger();
      expect(second.summary).toEqual(first.summary);
      expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(historyReads);
      const explanation = await ledger(true);
      expect(explanation.summary).toEqual(second.summary);
      expect(second.summary.realizedGainLoss).toBe(
        scenario === "short" ? 20 : 40,
      );
      if (scenario === "closed")
        expect(second.summary.unrealizedGainLoss).toBe(0);
      if (scenario.endsWith("transfer")) {
        const archived = await queryAccountGainLossSummaries({
          accountBookId: "book",
          type: "ASSET",
          accountState: "inactive",
        });
        expect(archived.total.summary.realizedGainLoss).toBe(20);
        expect(archived.total.summary.unrealizedGainLoss).toBe(0);
      }
    },
  );

  it("reuses basis across UTC days and publication cutoffs without historical reads", async () => {
    await load();
    vi.setSystemTime(new Date("2026-05-13T00:04:00Z"));
    closingRate = 190;
    expect((await ledger()).summary.totalGainLoss).toBe(210);
    vi.setSystemTime(new Date("2026-05-13T00:05:00Z"));
    closingRate = 200;
    expect((await list()).total.summary.totalGainLoss).toBe(230);
    expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.db.booking.groupBy).toHaveBeenCalledTimes(1);
  });

  it("revalues cached lots after a missing closing price recovers", async () => {
    closingRate = null;
    const first = await list();
    expect(first.total.summary).toEqual({
      realizedGainLoss: 40,
      unrealizedGainLoss: null,
      totalGainLoss: null,
    });
    expect(mocks.entries.has(basisKey)).toBe(true);
    closingRate = 170;
    expect((await ledger()).summary.totalGainLoss).toBe(170);
    expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(1);
  });

  it("retains the outer summary cache and its stable-price persistence rules", async () => {
    closingSource = "timeSeries";
    await list();
    const snapshots = mocks.snapshot.mock.calls.length;
    const rates = mocks.rate.mock.calls.length;
    await list();
    expect(mocks.snapshot).toHaveBeenCalledTimes(snapshots);
    expect(mocks.rate).toHaveBeenCalledTimes(rates);
    expect(
      [...mocks.entries.keys()].filter((key) =>
        key.startsWith("account:gain-loss:v4:"),
      ),
    ).toHaveLength(1);
  });

  it("separates historical ledger periods and notices future bookings without edits", async () => {
    await load();
    expect((await ledger(false, "2026-02")).summary.realizedGainLoss).toBe(0);
    expect((await ledger(true, "2026-02")).summary.realizedGainLoss).toBe(0);
    transactions.push(trade("future", "2026-05-13Z", "-1", "200"));
    // Simulate an already posted future transaction: the current watermark stays unchanged.
    expect((await ledger()).summary.realizedGainLoss).toBe(40);
    vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));
    const updated = await ledger();
    expect(updated.summary.realizedGainLoss).toBe(140);
    expect((await ledger(true)).summary).toEqual(updated.summary);
    expect(
      [...mocks.entries.keys()].some((key) =>
        key.endsWith(":2026-05-13T00:00:00.000Z"),
      ),
    ).toBe(false);
    // Today's non-identity execution prices are provisional; tomorrow they can persist.
    vi.setSystemTime(new Date("2026-05-14T12:00:00Z"));
    await ledger();
    expect(
      [...mocks.entries.keys()].some((key) =>
        key.endsWith(":2026-05-13T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it.each(["provider", "fallback", "missing"] as const)(
    "does not freeze %s basis prices",
    async (source) => {
      basisSource = source;
      await load();
      await load();
      expect(mocks.entries.has(basisKey)).toBe(false);
      expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(2);
      basisSource = "timeSeries";
      await load();
      expect(mocks.entries.has(basisKey)).toBe(true);
    },
  );

  it("does not cache incomplete or partially posted bases", async () => {
    mocks.db.booking.findMany.mockResolvedValue([{ accountId: "holding" }]);
    expect((await ledger()).summary.totalGainLoss).toBeNull();
    expect(mocks.entries.has(basisKey)).toBe(false);
    mocks.db.booking.findMany.mockResolvedValue([]);
    mocks.rate.mockResolvedValueOnce({ rate: null, source: "missing" });
    expect((await ledger()).summary.realizedGainLoss).toBeNull();
    expect(mocks.entries.has(basisKey)).toBe(false);
    mocks.db.account.findMany.mockResolvedValue([{ ...holding, symbol: null }]);
    expect((await ledger()).diagnostics[0]!.message).toContain("metadata");
    expect(mocks.entries.has(basisKey)).toBe(false);
  });

  it("bypasses caching before book start and supports an empty booking watermark", async () => {
    expect((await ledger(false, "2025")).summary.totalGainLoss).toBe(0);
    expect(redis.get).not.toHaveBeenCalled();
    expect(mocks.entries.size).toBe(0);
    transactions = [];
    await load();
    expect([...mocks.entries.keys()]).toEqual([
      "account:gain-loss-basis:v3:test:book:revision:empty",
    ]);
  });

  it("isolates books, environments, and committed revisions", async () => {
    await load();
    await loadAccountGainLossSummaryRange({
      accountBookId: "other",
      asOfDate: new Date("2026-05-12Z"),
    });
    vi.stubEnv("PERIOD_BASE_CACHE_ENV", "production");
    await load();
    mocks.db.accountBook.findUniqueOrThrow.mockResolvedValue({
      ...book,
      periodCacheRevision: "new",
    });
    await load();
    expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(4);
    expect(mocks.entries.size).toBe(4);
  });

  it("does not publish a snapshot from a different revision or booking watermark", async () => {
    mocks.db.accountBook.findUniqueOrThrow
      .mockResolvedValueOnce(book)
      .mockResolvedValue({ ...book, periodCacheRevision: "new" });
    await load();
    expect(mocks.entries.size).toBe(0);
    mocks.db.accountBook.findUniqueOrThrow.mockResolvedValue(book);
    mocks.db.booking.findFirst.mockResolvedValueOnce({
      date: buy.bookings[0]!.date,
    });
    await load();
    expect(mocks.entries.size).toBe(0);
  });

  it.each(["changed", "unavailable", "publication"])(
    "skips writes when the final guard is %s",
    async (kind) => {
      if (kind === "changed")
        mocks.db.accountBook.findUniqueOrThrow
          .mockResolvedValueOnce(book)
          .mockResolvedValueOnce(book)
          .mockResolvedValueOnce({ ...book, periodCacheRevision: "new" });
      if (kind === "unavailable")
        mocks.db.accountBook.findUniqueOrThrow
          .mockResolvedValueOnce(book)
          .mockResolvedValueOnce(book)
          .mockRejectedValueOnce(new Error("revision unavailable"));
      if (kind === "publication")
        mocks.conversion.mockImplementationOnce(async () => {
          vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));
          return { value: toMoney(100), source: "timeSeries" };
        });
      await load();
      expect(mocks.entries.size).toBe(0);
    },
  );

  it.each(["redis", "scope", "read", "write"])(
    "returns correct results after a %s failure",
    async (kind) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      if (kind === "redis") mocks.redis.mockResolvedValueOnce(null);
      if (kind === "scope")
        mocks.snapshot.mockRejectedValueOnce(new Error("scope unavailable"));
      if (kind === "read")
        redis.get.mockRejectedValueOnce(new Error("read unavailable"));
      if (kind === "write")
        redis.setEx.mockRejectedValueOnce(new Error("write unavailable"));
      expect((await ledger()).summary.totalGainLoss).toBe(150);
      if (kind === "redis" || kind === "scope")
        expect(redis.get).not.toHaveBeenCalled();
    },
  );

  it("requires the shared namespace", async () => {
    vi.stubEnv("PERIOD_BASE_CACHE_ENV", "");
    await expect(load()).rejects.toThrow("PERIOD_BASE_CACHE_ENV");
  });

  it("rebuilds instead of reusing bases without archived group metadata", async () => {
    await load();
    const payload = mocks.entries.get(basisKey)!;
    mocks.entries.clear();
    const oldKey = basisKey.replace(":v3:", ":v2:");
    mocks.entries.set(oldKey, payload);
    mocks.db.transaction.findMany.mockClear();
    await load();
    expect(mocks.db.transaction.findMany).toHaveBeenCalled();
    expect(mocks.entries.has(basisKey)).toBe(true);
    expect(mocks.entries.get(oldKey)).toBe(payload);
  });

  it("ignores malformed and oversized entries and bounds writes", async () => {
    await load();
    const good = mocks.entries.get(basisKey)!;
    for (const invalid of [
      "{",
      "null",
      "{}",
      '"' + "x".repeat(2 * 1024 * 1024) + '"',
    ]) {
      mocks.entries.set(basisKey, invalid);
      await load();
    }
    const payload = JSON.parse(good);
    payload.referenceCurrency = "x".repeat(2 * 1024 * 1024);
    mocks.entries.delete(basisKey);
    mocks.db.accountBook.findUniqueOrThrow.mockResolvedValue({
      ...book,
      referenceCurrency: payload.referenceCurrency,
    });
    redis.setEx.mockClear();
    await load();
    expect(redis.setEx).not.toHaveBeenCalled();
  });

  it("round-trips exact decimal lots and validates cached metadata and state", async () => {
    mocks.db.booking.groupBy.mockResolvedValue([
      { accountId: "holding", _sum: { value: "2.000000000000000001" } },
    ]);
    await load();
    const encoded = mocks.entries.get(basisKey)!;
    const decoded = decodeMoneyCache<unknown>(JSON.parse(encoded));
    expect(isAccountGainLossBasisCacheData(decoded)).toBe(true);
    if (!isAccountGainLossBasisCacheData(decoded))
      throw new Error("invalid fixture");
    expect(decoded.basis.holdings[0]!.state.lots[0]!.quantity.toString()).toBe(
      "1.000000000000000001",
    );
    const mutations = [
      (p: typeof decoded) => {
        p.revision = "wrong";
      },
      (p: typeof decoded) => {
        p.watermark = "empty";
      },
      (p: typeof decoded) => {
        p.startDate = new Date("2025-01-01Z");
      },
      (p: typeof decoded) => {
        p.basis.holdings[0]!.state.realizedGainLoss =
          undefined as unknown as ReturnType<typeof toMoney>;
      },
      (p: typeof decoded) => {
        p.basis.holdings[0]!.state.account.symbol = "other";
      },
      (p: typeof decoded) => {
        p.basis.holdings[0]!.unavailable = true;
      },
      (p: typeof decoded) => {
        p.basis.holdings[0]!.state.skipped = true;
      },
      (p: typeof decoded) => {
        p.basis.holdings.push(p.basis.holdings[0]!);
      },
      (p: typeof decoded) => {
        p.accounts.push(p.accounts[0]!);
      },
      (p: typeof decoded) => {
        p.basis.holdings = [];
      },
      (p: typeof decoded) => {
        p.basis.holdings[0]!.state.lots[0]!.acquisitionSortKey =
          undefined as unknown as string;
      },
    ];
    for (const mutate of mutations) {
      const payload = decodeMoneyCache<typeof decoded>(JSON.parse(encoded));
      mutate(payload);
      mocks.entries.set(basisKey, JSON.stringify(encodeMoneyCache(payload)));
      const reads = mocks.db.transaction.findMany.mock.calls.length;
      await load();
      expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(reads + 1);
    }
    expect(readPayload()).not.toHaveProperty("asOfDate");
  });

  it("does not join or publish a replay from before a committed mutation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.db.transaction.findMany.mockImplementationOnce(async () => {
      await gate;
      return [buy, sell];
    });
    const old = load();
    await vi.waitFor(() =>
      expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(1),
    );
    mocks.db.accountBook.findUniqueOrThrow.mockResolvedValue({
      ...book,
      periodCacheRevision: "new",
    });
    await load();
    release();
    await old;
    expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.entries.has(basisKey)).toBe(false);
    expect([...mocks.entries.keys()]).toEqual([
      basisKey.replace(":revision:", ":new:"),
    ]);
  });

  it("keeps concurrent closing dates separate even when their effective bookings match", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.db.transaction.findMany.mockImplementationOnce(async () => {
      await gate;
      return [buy, sell];
    });
    const old = load("2026-04-30Z");
    await vi.waitFor(() =>
      expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(1),
    );
    const current = await load();
    release();
    expect((await old).asOfDate).toBe("2026-04-30T00:00:00.000Z");
    expect(current.asOfDate).toBe("2026-05-12T00:00:00.000Z");
  });

  it("deduplicates simultaneous requests and retries a rejected replay", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.db.transaction.findMany.mockImplementationOnce(async () => {
      await gate;
      throw new Error("replay unavailable");
    });
    const first = load();
    await vi.waitFor(() =>
      expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(1),
    );
    const second = load();
    const results = Promise.allSettled([first, second]);
    await vi.waitFor(() =>
      expect(mocks.db.booking.findFirst).toHaveBeenCalledTimes(2),
    );
    release();
    expect((await results).map((r) => r.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(mocks.db.transaction.findMany).toHaveBeenCalledTimes(1);
    await load();
    expect(mocks.entries.has(basisKey)).toBe(true);
  });
});
