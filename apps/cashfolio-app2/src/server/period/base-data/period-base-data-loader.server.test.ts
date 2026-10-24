import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  accountBook: { findUniqueOrThrow: vi.fn() },
  accountGroup: { findMany: vi.fn() },
  account: { findMany: vi.fn() },
  booking: { groupBy: vi.fn(), findMany: vi.fn() },
  transaction: { findMany: vi.fn() },
}));
const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  accountBook: { findUniqueOrThrow: vi.fn() },
  accountGroup: { findMany: vi.fn() },
  account: { findMany: vi.fn() },
  booking: { groupBy: vi.fn(), findMany: vi.fn() },
  transaction: { findMany: vi.fn() },
}));
vi.mock("../../../prisma.server", () => ({ prisma }));

import {
  loadPeriodBaseDataSnapshot,
  loadPeriodBaseDataUncached,
} from "./period-base-data-loader.server";

describe("period database snapshot boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (read) => read(tx));
    tx.$executeRaw.mockResolvedValue(0);
    tx.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00Z"),
      periodCacheRevision: "snapshot-revision",
    });
    tx.accountGroup.findMany.mockResolvedValue([]);
    tx.account.findMany.mockImplementation(async ({ where }) =>
      where.type === AccountType.EQUITY
        ? [
            {
              id: "gain-loss",
              name: "Gain/Loss",
              groupId: null,
              equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
            },
          ]
        : [
            {
              id: "usd",
              name: "USD Cash",
              groupId: null,
              type: AccountType.BALANCE,
              unit: Unit.CURRENCY,
              currency: "USD",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              isCashAccount: true,
            },
          ],
    );
    tx.booking.groupBy.mockResolvedValue([
      { accountId: "usd", _sum: { value: "12.3456789123456789" } },
    ]);
    tx.transaction.findMany.mockResolvedValue([]);
    tx.booking.findMany.mockImplementation(async ({ where }) => {
      if (where.transactionId)
        return [
          {
            transactionId: "explicit",
            accountId: "usd",
            account: { name: "USD Cash" },
          },
        ];
      if (where.date.gte)
        return [
          {
            id: "gain-booking",
            accountId: "gain-loss",
            transactionId: "explicit",
            date: new Date("2026-02-10T00:00:00Z"),
            value: "1",
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ];
      return [];
    });
  });

  it("uses one read-only repeatable-read client for metadata, balances and every nested query", async () => {
    const snapshot = await loadPeriodBaseDataSnapshot({
      accountBookId: "book",
      period: "2026-02",
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      timeout: 30_000,
    });
    expect(tx.$executeRaw.mock.calls[0][0].join("")).toBe(
      "SET TRANSACTION READ ONLY",
    );
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.accountBook.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
    expect(tx.accountBook.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          referenceCurrency: true,
          startDate: true,
          periodCacheRevision: true,
        },
      }),
    );
    expect(snapshot.revision).toBe("snapshot-revision");
    expect(snapshot.data.endOfPeriodRawBalances[0].rawBalance.toString()).toBe(
      "12.3456789123456789",
    );
    expect(snapshot.data.explicitCounterparts).toEqual([
      { transactionId: "explicit", accountId: "usd", accountName: "USD Cash" },
    ]);
    expect(tx.transaction.findMany).toHaveBeenCalledTimes(3);
    expect(tx.booking.findMany).toHaveBeenCalledTimes(3);
    for (const model of [
      prisma.accountBook,
      prisma.accountGroup,
      prisma.account,
      prisma.booking,
      prisma.transaction,
    ]) {
      for (const read of Object.values(model))
        expect(read).not.toHaveBeenCalled();
    }
  });

  it("keeps the uncached facade's payload free of snapshot metadata", async () => {
    const data = await loadPeriodBaseDataUncached({
      accountBookId: "book",
      period: "2026-02",
    });
    expect(data.referenceCurrency).toBe("CHF");
    expect(data).not.toHaveProperty("revision");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("propagates transaction failures without retrying through the global client", async () => {
    const failure = new Error("snapshot timed out");
    prisma.$transaction.mockRejectedValueOnce(failure);
    await expect(
      loadPeriodBaseDataUncached({ accountBookId: "book", period: "2026-02" }),
    ).rejects.toBe(failure);
    expect(prisma.accountBook.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
