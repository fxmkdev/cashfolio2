import { beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../shared/money";
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
}));
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
vi.mock("../period/period-conversion", () => ({
  convertBookingValueToReference: vi.fn(),
  getUnitToReferenceExchangeRate: vi.fn(),
}));
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
  type = "ASSET",
  isActive = true,
  groupId: string | null = "child",
) => ({ ...base, id, name: id, type, isActive, groupId });
const result = (amount: string) => ({
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
    startDate: new Date("2026-01-01Z"),
  });
  mocks.accounts.mockResolvedValue([
    account("a"),
    account("b", "ASSET", false),
    account("c", "LIABILITY"),
    { ...account("cash"), unit: "CURRENCY", currency: "CHF" },
  ]);
  mocks.groups.mockResolvedValue([
    { id: "root", parentGroupId: null, type: "ASSET" },
    { id: "child", parentGroupId: "root", type: "ASSET" },
    { id: "empty", parentGroupId: null, type: "ASSET" },
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
      type: "ASSET",
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

  it("calculates all holdings, then scopes nested groups/footer to active assets", async () => {
    const response = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "ASSET",
      accountState: "active",
    });
    expect(
      mocks.calculate.mock.calls[0]![0].holdingAccounts.map(
        (item: { id: string }) => item.id,
      ),
    ).toEqual(["a", "b", "c"]);
    expect(response.rows.map((item) => item.id)).toEqual([
      "a",
      "cash",
      "root",
      "child",
      "empty",
    ]);
    for (const id of ["a", "root", "child"])
      expect(
        response.rows.find((row) => row.id === id)!.summary.totalGainLoss,
      ).toBe(0.1);
    expect(response.total.summary.totalGainLoss).toBe(0.1);
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
  it("retains archived account realised gains and uses economic signs on liabilities", async () => {
    const archived = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "ASSET",
      accountState: "inactive",
    });
    const liabilities = await queryAccountGainLossSummaries({
      accountBookId: "book",
      type: "LIABILITY",
      accountState: "active",
    });
    expect(archived.total.summary.realizedGainLoss).toBe(0.2);
    expect(liabilities.total.summary.realizedGainLoss).toBe(0.3);
  });
  it("withholds a group/footer component when a descendant is incomplete", async () => {
    mocks.calculate.mockResolvedValue({
      results: new Map([
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
      type: "ASSET",
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
