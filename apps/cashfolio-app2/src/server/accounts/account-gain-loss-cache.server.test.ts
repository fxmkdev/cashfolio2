import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../shared/money";
import { encodeMoneyCache } from "../money-cache-codec";
import type { loadAccountGainLossRange as LoadRange } from "./account-gain-loss-range.server";

const mocks = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  get: vi.fn<(key: string) => Promise<string | null>>(),
  setEx: vi.fn<(key: string, ttl: number, value: string) => Promise<void>>(),
  redis: vi.fn(),
  revision: vi.fn(),
  load: vi.fn<typeof LoadRange>(),
}));
vi.mock("../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../prisma.server", () => ({
  prisma: { accountBook: { findUniqueOrThrow: mocks.revision } },
}));
vi.mock("./account-gain-loss-range.server", () => ({
  loadAccountGainLossRange: mocks.load,
}));
import { getOrLoadAccountGainLossSummaries } from "./account-gain-loss-cache.server";
import { queryAccountGainLossSummaries } from "./account-gain-loss.server";
import { toAccountGainLossCacheData } from "./account-gain-loss-cache-data";

const key = "account:gain-loss:v1:test:book:gen-1:2026-05-11:2026-05-10";
function createRange(): Awaited<ReturnType<typeof LoadRange>> {
  const base = {
    name: "Holding",
    unit: "SECURITY" as const,
    currency: null,
    cryptocurrency: null,
    symbol: "TEST",
    tradeCurrency: "CHF",
    groupId: "child",
  };
  const result = (amount: string) => ({
    applicable: true,
    summary: {
      realizedGainLoss: toMoney(amount),
      unrealizedGainLoss: null,
      totalGainLoss: null,
    },
    diagnostics: [
      {
        date: "2026-05-11T00:00:00.000Z",
        message: "Closing valuation unavailable",
      },
    ],
  });
  return {
    accounts: [
      { ...base, id: "a", type: "ASSET", isActive: true },
      { ...base, id: "b", type: "ASSET", isActive: false },
      { ...base, id: "c", type: "LIABILITY", isActive: true, groupId: null },
    ],
    groups: [
      { id: "root", parentGroupId: null, type: "ASSET" },
      { id: "child", parentGroupId: "root", type: "ASSET" },
    ],
    results: new Map([
      ["a", result("0.100000000000000001")],
      ["b", result("0.2")],
      ["c", result("0.3")],
    ]),
    realizedEvents: [],
    unrealizedOpenLots: [],
    referenceCurrency: "CHF",
    startDate: "2026-01-01T00:00:00.000Z",
    asOfDate: "2026-05-11T00:00:00.000Z",
    revision: "gen-1",
    cacheableFromPermanentValuationCache: true,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.kv.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-11T14:00:00Z"));
  vi.stubEnv("PERIOD_BASE_CACHE_ENV", "test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.get.mockImplementation(async (k) => mocks.kv.get(k) ?? null);
  mocks.setEx.mockImplementation(async (k, _ttl, value) => {
    mocks.kv.set(k, value);
  });
  mocks.redis.mockResolvedValue({ get: mocks.get, setEx: mocks.setEx });
  mocks.revision.mockResolvedValue({ periodCacheRevision: "gen-1" });
  mocks.load.mockImplementation(async ({ asOfDate }) => ({
    ...createRange(),
    asOfDate: asOfDate.toISOString(),
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("account G/L summary cache", () => {
  it("shares a book-wide replay across tabs and states, preserving group totals and diagnostics", async () => {
    const query = (
      type: "ASSET" | "LIABILITY",
      accountState: "active" | "inactive",
    ) =>
      queryAccountGainLossSummaries({
        accountBookId: "book",
        type,
        accountState,
      });
    const active = await query("ASSET", "active");
    const archived = await query("ASSET", "inactive");
    const liabilities = await query("LIABILITY", "active");
    const empty = await query("LIABILITY", "inactive");
    expect(active.rows.map((r) => r.id)).toEqual(["a", "root", "child"]);
    expect(active.rows.map((r) => r.summary.realizedGainLoss)).toEqual([
      0.1, 0.1, 0.1,
    ]);
    expect(active.total.summary).toEqual({
      realizedGainLoss: 0.1,
      unrealizedGainLoss: null,
      totalGainLoss: null,
    });
    expect(active.rows[1]!.diagnostics).toEqual(active.rows[0]!.diagnostics);
    expect(archived.total.summary.realizedGainLoss).toBe(0.2);
    expect(liabilities.total.summary.realizedGainLoss).toBe(0.3);
    expect(empty.total.applicable).toBe(false);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith({
      accountBookId: "book",
      asOfDate: new Date("2026-05-11Z"),
    });
    expect(mocks.setEx).toHaveBeenCalledWith(key, 86400, expect.any(String));
    expect(mocks.revision).toHaveBeenCalledTimes(5);
    expect(active).not.toHaveProperty("revision");
    expect(active).not.toHaveProperty("cacheableFromPermanentValuationCache");
  });

  it("round-trips exact decimals and excludes replay details from its payload", async () => {
    const cold = await getOrLoadAccountGainLossSummaries("book");
    const warm = await getOrLoadAccountGainLossSummaries("book");
    expect(warm).toEqual(cold);
    expect(warm.accounts[0]!.result.summary.realizedGainLoss!.toString()).toBe(
      "0.100000000000000001",
    );
    const payload = JSON.parse(mocks.kv.get(key)!);
    expect(payload).not.toHaveProperty("realizedEvents");
    expect(payload).not.toHaveProperty("revision");
    expect(payload.accounts[0]).not.toHaveProperty("name");
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("isolates books, environments, revisions, UTC days, and publication windows", async () => {
    await getOrLoadAccountGainLossSummaries("book");
    await getOrLoadAccountGainLossSummaries("other");
    vi.stubEnv("PERIOD_BASE_CACHE_ENV", "production");
    await getOrLoadAccountGainLossSummaries("book");
    mocks.revision.mockResolvedValue({ periodCacheRevision: "gen-2" });
    mocks.load.mockImplementation(async ({ asOfDate }) => ({
      ...createRange(),
      revision: "gen-2",
      asOfDate: asOfDate.toISOString(),
    }));
    await getOrLoadAccountGainLossSummaries("book");
    vi.setSystemTime(new Date("2026-05-12T00:04:00Z"));
    await getOrLoadAccountGainLossSummaries("book");
    vi.setSystemTime(new Date("2026-05-12T00:05:00Z"));
    await getOrLoadAccountGainLossSummaries("book");
    expect(mocks.setEx.mock.calls.map(([k]) => k)).toEqual([
      key,
      "account:gain-loss:v1:test:other:gen-1:2026-05-11:2026-05-10",
      "account:gain-loss:v1:production:book:gen-1:2026-05-11:2026-05-10",
      "account:gain-loss:v1:production:book:gen-2:2026-05-11:2026-05-10",
      "account:gain-loss:v1:production:book:gen-2:2026-05-12:2026-05-10",
      "account:gain-loss:v1:production:book:gen-2:2026-05-12:2026-05-11",
    ]);
    expect(mocks.load).toHaveBeenCalledTimes(6);
  });

  it("does not persist a snapshot from a different revision", async () => {
    mocks.load.mockResolvedValueOnce({ ...createRange(), revision: "gen-2" });
    await getOrLoadAccountGainLossSummaries("book");
    expect(mocks.setEx).not.toHaveBeenCalled();
  });

  it.each(["changed", "unavailable"])(
    "does not persist when final revision is %s",
    async (kind) => {
      mocks.revision.mockResolvedValueOnce({ periodCacheRevision: "gen-1" });
      if (kind === "changed")
        mocks.revision.mockResolvedValueOnce({ periodCacheRevision: "gen-2" });
      else
        mocks.revision.mockRejectedValueOnce(new Error("Database unavailable"));
      expect(
        (await getOrLoadAccountGainLossSummaries("book")).accounts,
      ).toHaveLength(3);
      expect(mocks.setEx).not.toHaveBeenCalled();
    },
  );

  it("does not persist across a publication cutoff and keeps the resolved as-of date", async () => {
    vi.setSystemTime(new Date("2026-05-11T00:04:59Z"));
    mocks.load.mockImplementationOnce(async (args) => {
      vi.setSystemTime(new Date("2026-05-12T00:05:00Z"));
      expect(args.asOfDate).toEqual(new Date("2026-05-11Z"));
      return createRange();
    });
    expect((await getOrLoadAccountGainLossSummaries("book")).asOfDate).toBe(
      "2026-05-11T00:00:00.000Z",
    );
    expect(mocks.setEx).not.toHaveBeenCalled();
  });

  it("returns non-permanent valuation results without persisting", async () => {
    mocks.load.mockResolvedValue({
      ...createRange(),
      cacheableFromPermanentValuationCache: false,
    });
    await getOrLoadAccountGainLossSummaries("book");
    await getOrLoadAccountGainLossSummaries("book");
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.setEx).not.toHaveBeenCalled();
  });

  it.each(["redis", "revision"])(
    "bypasses reads and writes when %s is unavailable",
    async (kind) => {
      await getOrLoadAccountGainLossSummaries("book");
      vi.clearAllMocks();
      if (kind === "redis") mocks.redis.mockResolvedValueOnce(null);
      else
        mocks.revision.mockRejectedValueOnce(new Error("Database unavailable"));
      await getOrLoadAccountGainLossSummaries("book");
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.setEx).not.toHaveBeenCalled();
      expect(mocks.load).toHaveBeenCalledTimes(1);
    },
  );

  it("requires the shared deployment namespace when Redis is enabled", async () => {
    vi.stubEnv("PERIOD_BASE_CACHE_ENV", "");
    await expect(getOrLoadAccountGainLossSummaries("book")).rejects.toThrow(
      "PERIOD_BASE_CACHE_ENV",
    );
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it.each(["read", "write"])(
    "returns calculated results on a Redis %s failure",
    async (kind) => {
      if (kind === "read")
        mocks.get.mockRejectedValueOnce(new Error("Redis unavailable"));
      else mocks.setEx.mockRejectedValueOnce(new Error("Redis unavailable"));
      const data = await getOrLoadAccountGainLossSummaries("book");
      expect(data.accounts).toHaveLength(3);
      expect(console.warn).toHaveBeenCalled();
    },
  );

  it("skips oversized writes and reads", async () => {
    const range = createRange();
    range.results.get("a")!.diagnostics[0]!.message = "x".repeat(512 * 1024);
    mocks.load.mockResolvedValueOnce(range);
    await getOrLoadAccountGainLossSummaries("book");
    expect(mocks.setEx).not.toHaveBeenCalled();
    mocks.kv.set(
      key,
      JSON.stringify(encodeMoneyCache(toAccountGainLossCacheData(range))),
    );
    const data = await getOrLoadAccountGainLossSummaries("book");
    expect(data.accounts[0]!.result.diagnostics[0]!.message).toBe(
      "Closing valuation unavailable",
    );
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it.each([
    "{",
    "null",
    "{}",
    JSON.stringify({ referenceCurrency: { __cashfolioDecimal: "NaN" } }),
  ])("ignores malformed encoded cache entry %s", async (value) => {
    mocks.kv.set(key, value);
    await getOrLoadAccountGainLossSummaries("book");
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("ignores structurally invalid and wrong-day cached data", async () => {
    const data = toAccountGainLossCacheData(createRange());
    for (const invalid of [
      {
        ...data,
        accounts: [{ ...data.accounts[0], result: { applicable: true } }],
      },
      { ...data, asOfDate: "2026-05-10T00:00:00.000Z" },
    ]) {
      mocks.kv.set(key, JSON.stringify(encodeMoneyCache(invalid)));
      await getOrLoadAccountGainLossSummaries("book");
    }
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("deduplicates overlapping loads and clears failed promises for retry", async () => {
    const gate = deferred<Awaited<ReturnType<typeof LoadRange>>>();
    const ready = deferred<void>();
    mocks.load.mockImplementationOnce(() => {
      ready.resolve();
      return gate.promise;
    });
    const first = getOrLoadAccountGainLossSummaries("book");
    await ready.promise;
    const second = getOrLoadAccountGainLossSummaries("book");
    const settled = Promise.allSettled([first, second]);
    // Wait until the second request has read the revision and joined the load.
    await vi.waitFor(() => expect(mocks.revision).toHaveBeenCalledTimes(2));
    gate.reject(new Error("Calculation failed"));
    expect((await settled).map((r) => r.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    await getOrLoadAccountGainLossSummaries("book");
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("shares successful inflight loads even when their result cannot be persisted", async () => {
    const gate = deferred<Awaited<ReturnType<typeof LoadRange>>>();
    const ready = deferred<void>();
    mocks.load.mockImplementationOnce(() => {
      ready.resolve();
      return gate.promise;
    });
    const first = getOrLoadAccountGainLossSummaries("book");
    await ready.promise;
    const second = getOrLoadAccountGainLossSummaries("book");
    await vi.waitFor(() => expect(mocks.revision).toHaveBeenCalledTimes(2));
    gate.resolve({
      ...createRange(),
      cacheableFromPermanentValuationCache: false,
    });
    expect((await Promise.all([first, second]))[0]).toEqual(await first);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    await getOrLoadAccountGainLossSummaries("book");
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("never joins a load started before a mutation committed", async () => {
    const gate = deferred<Awaited<ReturnType<typeof LoadRange>>>();
    const ready = deferred<void>();
    mocks.load.mockImplementationOnce(() => {
      ready.resolve();
      return gate.promise;
    });
    const old = getOrLoadAccountGainLossSummaries("book");
    await ready.promise;
    mocks.revision.mockResolvedValue({ periodCacheRevision: "gen-2" });
    mocks.load.mockResolvedValue({ ...createRange(), revision: "gen-2" });
    await getOrLoadAccountGainLossSummaries("book");
    gate.resolve(createRange());
    await old;
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.setEx).toHaveBeenCalledTimes(1);
    expect(mocks.setEx.mock.calls[0]![0]).toContain(":gen-2:");
  });
});
