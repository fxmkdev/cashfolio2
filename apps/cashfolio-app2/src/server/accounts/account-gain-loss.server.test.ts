import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountGainLossResult } from "../../shared/account-gain-loss";
import { toMoney, type Money } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  readOnly: vi.fn(),
  book: vi.fn(),
  accounts: vi.fn(),
  groups: vi.fn(),
  balances: vi.fn(),
  transactions: vi.fn(),
  pending: vi.fn(),
  calculate: vi.fn(),
  rate: vi.fn(),
  conversion: vi.fn(),
  redis: vi.fn(),
}));
vi.mock("../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../prisma.server", () => ({
  prisma: {
    $transaction: mocks.snapshot,
    accountBook: { findUniqueOrThrow: mocks.book },
    account: { findMany: mocks.accounts },
    accountGroup: { findMany: mocks.groups },
    booking: { groupBy: mocks.balances, findMany: mocks.pending },
  },
}));
vi.mock(
  "../period/base-data/period-base-data-holding-transactions.server",
  () => ({ loadPeriodHoldingTransactionsRaw: mocks.transactions }),
);
vi.mock("./account-gain-loss-calculation.server", () => ({
  calculateAccountGainLoss: mocks.calculate,
}));
vi.mock("./account-gain-loss-basis-cache.server", async () => {
  const { loadAccountGainLossRange } =
    await import("./account-gain-loss-range.server");
  return { loadAccountGainLossSummaryRange: loadAccountGainLossRange };
});
vi.mock("../period/period-conversion", () => ({
  convertBookingValueToReferenceDetails: mocks.conversion,
  getUnitToReferenceExchangeRateDetails: mocks.rate,
}));
import { loadAccountGainLossRange } from "./account-gain-loss-range.server";
import {
  queryAccountGainLoss,
  queryAccountGainLossSummaries,
  resolveAccountGainLossDate,
} from "./account-gain-loss.server";
const base = {
  unit: "SECURITY",
  symbol: "AAPL",
  tradeCurrency: "CHF",
  currency: null,
  cryptocurrency: null,
};
const account = (
  id: string,
  type = "BALANCE",
  isActive = true,
  groupId: string | null = "child",
) => ({ ...base, id, name: id, type, isActive, groupId });
const result = (amount: string): AccountGainLossResult<Money> => ({
  applicable: true,
  summary: {
    realizedGainLoss: toMoney(amount),
    unrealizedGainLoss: toMoney(0),
    totalGainLoss: toMoney(amount),
  },
  diagnostics: [],
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.redis.mockResolvedValue(null);
  mocks.snapshot.mockImplementation(async (load) =>
    load({
      $executeRaw: mocks.readOnly,
      accountBook: { findUniqueOrThrow: mocks.book },
      account: { findMany: mocks.accounts },
      accountGroup: { findMany: mocks.groups },
      booking: { groupBy: mocks.balances, findMany: mocks.pending },
      transaction: { findMany: vi.fn() },
    }),
  );
  mocks.book.mockResolvedValue({
    referenceCurrency: "CHF",
    periodCacheRevision: "revision",
    startDate: new Date("2026-01-01Z"),
  });
  mocks.accounts.mockResolvedValue([
    account("a"),
    account("b", "BALANCE", false),
    account("c", "BALANCE"),
    { ...account("cash"), unit: "CURRENCY", currency: "CHF" },
  ]);
  mocks.groups.mockResolvedValue([
    { id: "root", parentGroupId: null, type: "BALANCE", isActive: true },
    { id: "child", parentGroupId: "root", type: "BALANCE", isActive: true },
    { id: "empty", parentGroupId: null, type: "BALANCE", isActive: true },
  ]);
  mocks.balances.mockResolvedValue([
    { accountId: "a", _sum: { value: toMoney(2) } },
  ]);
  mocks.transactions.mockResolvedValue([]);
  mocks.pending.mockResolvedValue([]);
  mocks.calculate.mockImplementation(async () => ({
    results: new Map([
      ["a", result("0.1")],
      ["b", result("0.2")],
      ["c", result("0.3")],
    ]),
    realizedEvents: [],
    unrealizedOpenLots: [],
  }));
});

describe("account G/L queries", () => {
  it("uses snapshot opening-balance account IDs when loading holding transactions", async () => {
    mocks.accounts
      .mockResolvedValueOnce([account("a")])
      .mockResolvedValueOnce([{ id: "opening" }]);
    await loadAccountGainLossRange({
      accountBookId: "book",
      asOfDate: new Date("2026-02-01T00:00:00Z"),
    });
    expect(mocks.accounts).toHaveBeenCalledWith({
      where: {
        accountBookId: "book",
        type: "EQUITY",
        equityAccountSubtype: "OPENING_BALANCES",
      },
      select: { id: true },
    });
    expect(mocks.transactions).toHaveBeenCalledWith(
      expect.objectContaining({ openingBalanceAccountIds: ["opening"] }),
      expect.any(Object),
    );
  });

  it("aggregates balance accounts and archived descendants in a nested hierarchy", async () => {
    mocks.groups.mockResolvedValueOnce([
      { id: "root", parentGroupId: null, type: "BALANCE", isActive: true },
      { id: "child", parentGroupId: "root", type: "BALANCE", isActive: true },
    ]);
    const response = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "all",
    });
    expect(response.total.summary.totalGainLoss).toBe(0.6);
    expect(
      response.rows.find((row) => row.id === "root")?.summary.totalGainLoss,
    ).toBe(0.6);
    expect(
      response.rows.find((row) => row.id === "child")?.summary.totalGainLoss,
    ).toBe(0.6);
    expect(
      response.rows.find((row) => row.id === "b")?.summary.totalGainLoss,
    ).toBe(0.2);
  });

  it("loads one read-only snapshot and finishes it before calculations", async () => {
    mocks.snapshot.mockImplementationOnce(async (load) => {
      const client = {
        $executeRaw: mocks.readOnly,
        accountBook: { findUniqueOrThrow: mocks.book },
        account: { findMany: mocks.accounts },
        accountGroup: { findMany: mocks.groups },
        booking: { groupBy: mocks.balances, findMany: mocks.pending },
        transaction: { findMany: vi.fn() },
      };
      const inputs = await load(client);
      expect(mocks.calculate).not.toHaveBeenCalled();
      expect(mocks.transactions).toHaveBeenCalledWith(
        expect.any(Object),
        client,
      );
      expect(mocks.groups).toHaveBeenCalledTimes(1);
      return inputs;
    });
    await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "active",
    });
    expect(mocks.snapshot).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      timeout: 30_000,
    });
    expect(mocks.readOnly.mock.calls[0]![0][0]).toBe(
      "SET TRANSACTION READ ONLY",
    );
    expect(mocks.groups).toHaveBeenCalledTimes(1);
  });
  it("propagates snapshot failures without falling back to separate reads", async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error("snapshot failed"));
    await expect(
      queryAccountGainLoss({ accountBookId: "book", accountId: "a" }),
    ).rejects.toThrow("snapshot failed");
    expect(mocks.book).not.toHaveBeenCalled();
    expect(mocks.calculate).not.toHaveBeenCalled();
  });

  it("calculates all holdings, then scopes nested groups/footer to active accounts", async () => {
    const response = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "active",
    });
    expect(
      mocks.calculate.mock.calls[0]![0].holdingAccounts.map(
        (item: { id: string }) => item.id,
      ),
    ).toEqual(["a", "b", "c"]);
    expect(response.rows.map((item) => item.id)).toEqual([
      "a",
      "c",
      "cash",
      "root",
      "child",
      "empty",
    ]);
    for (const id of ["a", "root", "child"])
      expect(
        response.rows.find((row) => row.id === id)!.summary.totalGainLoss,
      ).toBe(id === "a" ? 0.1 : 0.4);
    expect(response.total.summary.totalGainLoss).toBe(0.4);
    expect(response.rows.find((row) => row.id === "cash")!.applicable).toBe(
      false,
    );
    expect(response.rows.find((row) => row.id === "empty")!.applicable).toBe(
      false,
    );
    expect(mocks.balances.mock.calls[0]![0].where.date.lt).toEqual(
      new Date("2026-01-01Z"),
    );
    expect(mocks.calculate.mock.calls[0]![0].initialRateDate).toEqual(
      new Date("2025-12-31Z"),
    );
  });
  it("retains archived account realised gains separately from active accounts", async () => {
    const archived = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "inactive",
    });
    const active = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "active",
    });
    expect(archived.total.summary.realizedGainLoss).toBe(0.2);
    expect(active.total.summary.realizedGainLoss).toBe(0.4);
  });
  it("withholds a group/footer component when a descendant is incomplete", async () => {
    mocks.calculate.mockResolvedValue({
      results: new Map([
        ["c", result("0")],
        [
          "a",
          {
            ...result("1"),
            summary: {
              realizedGainLoss: toMoney(1),
              unrealizedGainLoss: null,
              totalGainLoss: null,
            },
          },
        ],
      ]),
      realizedEvents: [],
      unrealizedOpenLots: [],
    });
    const response = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "active",
    });
    expect(response.total.summary).toEqual({
      realizedGainLoss: 1,
      unrealizedGainLoss: null,
      totalGainLoss: null,
    });
    expect(response.rows.find((row) => row.id === "root")!.summary).toEqual(
      response.total.summary,
    );
  });
  it("includes active and archived leaves once in real, virtual, and footer totals", async () => {
    mocks.accounts.mockResolvedValue([
      account("a"),
      account("b", "BALANCE", false),
      account("archived-root", "BALANCE", false, null),
      account("nested-leaf", "BALANCE", false, "archived-group"),
    ]);
    mocks.groups.mockResolvedValue([
      { id: "root", parentGroupId: null, type: "BALANCE", isActive: true },
      { id: "child", parentGroupId: "root", type: "BALANCE", isActive: true },
      {
        id: "archived-group",
        parentGroupId: "root",
        type: "BALANCE",
        isActive: false,
      },
    ]);
    mocks.calculate.mockResolvedValue({
      results: new Map([
        ["a", result("0.1")],
        ["b", result("0.2")],
        ["archived-root", result("0.3")],
        ["nested-leaf", result("0.4")],
      ]),
      realizedEvents: [],
      unrealizedOpenLots: [],
    });
    const response = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "all",
    });
    const totalFor = (id: string) =>
      response.rows.find((row) => row.id === id)?.summary.totalGainLoss;
    expect(response.total.summary.totalGainLoss).toBe(1);
    expect(totalFor("root")).toBe(0.7);
    expect(totalFor("child")).toBe(0.3);
    expect(totalFor("__archived__:group:child")).toBe(0.2);
    expect(totalFor("__archived__:group:root")).toBe(0.4);
    expect(totalFor("__archived__:root")).toBe(0.3);
    expect(totalFor("archived-group")).toBe(0.4);
    expect(
      response.rows.some(
        (row) => row.id === "__archived__:group:archived-group",
      ),
    ).toBe(false);
  });

  it("propagates incomplete archived components through virtual/real groups and footer", async () => {
    mocks.calculate.mockResolvedValue({
      results: new Map([
        ["a", result("0.1")],
        ["c", result("0")],
        [
          "b",
          {
            ...result("0.2"),
            summary: {
              realizedGainLoss: toMoney("0.2"),
              unrealizedGainLoss: null,
              totalGainLoss: null,
            },
            diagnostics: [
              { date: "2026-01-01Z", message: "Missing closing price" },
            ],
          },
        ],
      ]),
      realizedEvents: [],
      unrealizedOpenLots: [],
    });
    const response = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "BALANCE",
      accountState: "all",
    });
    expect(response.total.summary).toEqual({
      realizedGainLoss: 0.3,
      unrealizedGainLoss: null,
      totalGainLoss: null,
    });
    for (const id of ["root", "child", "__archived__:group:child"]) {
      const row = response.rows.find((row) => row.id === id)!;
      expect(row.summary.totalGainLoss).toBeNull();
      expect(row.diagnostics).toContainEqual({
        date: "2026-01-01Z",
        message: "Missing closing price",
      });
    }
  });

  it("loads historical summaries and on-demand details from the same range", async () => {
    const summary = await queryAccountGainLoss({
      accountBookId: "book",
      accountId: "a",
      period: "2026-02",
    });
    const details = await queryAccountGainLoss({
      accountBookId: "book",
      accountId: "a",
      period: "2026-02",
      includeDetails: true,
    });
    expect(summary.summary).toEqual(details.summary);
    expect(details.asOfDate).toBe("2026-02-28T00:00:00.000Z");
    expect(mocks.calculate.mock.calls[0]![0].detailAccountId).toBeUndefined();
    expect(mocks.calculate.mock.calls[1]![0].detailAccountId).toBe("a");
    expect(mocks.transactions.mock.calls[0]![0].queryEndExclusive).toEqual(
      new Date("2026-03-01Z"),
    );
  });
  it("rejects missing accounts and marks incomplete metadata as unavailable", async () => {
    await expect(
      queryAccountGainLoss({
        accountBookId: "book",
        accountId: "other-book-account",
      }),
    ).rejects.toThrow("Holding account not found");
    mocks.accounts.mockResolvedValue([{ ...account("invalid"), symbol: null }]);
    const response = await queryAccountGainLoss({
      accountBookId: "book",
      accountId: "invalid",
    });
    expect(response.applicable).toBe(true);
    expect(response.summary.totalGainLoss).toBeNull();
    expect(response.diagnostics[0]!.message).toContain("metadata");
  });
  it("includes posted holding legs whose execution is not yet fully posted", async () => {
    mocks.pending.mockResolvedValue([{ accountId: "a" }]);
    await queryAccountGainLoss({
      accountBookId: "book",
      accountId: "a",
      period: "2026-02",
    });
    expect(mocks.calculate.mock.calls[0]![0].unavailableHoldings).toEqual([
      "a",
    ]);
    expect(
      mocks.pending.mock.calls[0]![0].where.transaction.bookings.some.date.gte,
    ).toEqual(new Date("2026-03-01Z"));
  });
  it("does not replay before book start", async () => {
    await queryAccountGainLoss({
      accountBookId: "book",
      accountId: "a",
      period: "2025",
    });
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(
      toNumericMoney(
        mocks.calculate.mock.calls[0]![0].initialBalanceByAccountId.size,
      ),
    ).toBe(0);
  });
});

describe("account G/L date", () => {
  const now = new Date("2026-04-10T12:30:00Z");
  it("uses UTC today, historical period end, and caps future periods", () => {
    expect(resolveAccountGainLossDate(undefined, now)).toEqual(
      new Date("2026-04-10Z"),
    );
    expect(resolveAccountGainLossDate("2026-02", now)).toEqual(
      new Date("2026-02-28Z"),
    );
    expect(resolveAccountGainLossDate("2025", now)).toEqual(
      new Date("2025-12-31Z"),
    );
    expect(resolveAccountGainLossDate("2026", now)).toEqual(
      new Date("2026-04-10Z"),
    );
  });
  it("rejects malformed periods", () =>
    expect(() => resolveAccountGainLossDate("bad", now)).toThrow(
      "Invalid account G/L period",
    ));
});

describe("summary cache integration", () => {
  it("skips snapshot loading and replay on a warm summary hit, while ledger details remain uncached", async () => {
    const entries = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => entries.get(key) ?? null),
      setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
        entries.set(key, value);
      }),
    };
    mocks.redis.mockResolvedValue(redis);
    vi.stubEnv("PERIOD_BASE_CACHE_ENV", "test");
    try {
      await queryAccountGainLossSummaries({
        accountBookId: "book",
        type: "BALANCE",
        accountState: "active",
      });
      await queryAccountGainLossSummaries({
        accountBookId: "book",
        type: "BALANCE",
        accountState: "active",
      });
      expect(mocks.snapshot).toHaveBeenCalledTimes(1);
      expect(mocks.transactions).toHaveBeenCalledTimes(1);
      expect(mocks.calculate).toHaveBeenCalledTimes(1);
      expect(redis.get).toHaveBeenCalledTimes(2);
      expect(redis.setEx).toHaveBeenCalledTimes(1);
      await queryAccountGainLoss({
        accountBookId: "book",
        accountId: "a",
        includeDetails: true,
      });
      expect(mocks.calculate).toHaveBeenCalledTimes(2);
      expect(redis.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(["identity", "timeSeries", "fallback", "provider", "missing"])(
    "tracks %s dependencies for both opening/closing rates and execution conversions",
    async (source) => {
      const permanent = source === "identity" || source === "timeSeries";
      for (const dependency of ["rate", "conversion"]) {
        mocks.rate.mockResolvedValue({
          rate: toMoney(1),
          source: dependency === "rate" ? source : "identity",
        });
        mocks.conversion.mockResolvedValue({
          value: toMoney(2),
          source: dependency === "conversion" ? source : "identity",
        });
        const calculated = await mocks.calculate();
        mocks.calculate.mockImplementationOnce(async (args) => {
          const input = {
            unit: "CURRENCY",
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            date: new Date("2026-01-01Z"),
          };
          expect(await args.resolveRate(input)).toEqual(toMoney(1));
          expect(
            await args.convertBookingToReference({
              ...input,
              id: "booking",
              value: toMoney(2),
            }),
          ).toEqual(toMoney(2));
          return calculated;
        });
        const range = await loadAccountGainLossRange({
          accountBookId: "book",
          asOfDate: new Date("2026-05-11Z"),
        });
        expect(range.cacheableFromPermanentValuationCache).toBe(permanent);
        expect(range.revision).toBe("revision");
      }
    },
  );
});
