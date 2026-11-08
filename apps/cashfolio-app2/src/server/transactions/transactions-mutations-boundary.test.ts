import { beforeEach, describe, expect, it } from "vitest";
import {
  BASE_DATE,
  createSimpleTransaction,
  createTransaction,
  createTransactions,
  deleteTransaction,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  rebookBooking,
  resetTransactionBoundary,
  updateTransaction,
} from "./transactions-mutations.test-support";

describe("transaction mutation boundary validation", () => {
  beforeEach(resetTransactionBoundary);

  it("rejects oversized imports before authorization or transaction creation", async () => {
    await expect(
      createTransactions({
        data: {
          accountBookId: "book-1",
          transactions: Array(1001).fill(null),
        } as never,
      }),
    ).rejects.toThrow("1'000");
    expect(ensureAuthorizedForAccountBookId).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      createTransaction,
      { accountBookId: "book-1", description: "", bookings: [null] },
    ],
    [
      updateTransaction,
      {
        accountBookId: "book-1",
        transactionId: "tx-1",
        description: "",
        bookings: [{}],
      },
    ],
    [
      createTransactions,
      {
        accountBookId: "book-1",
        transactions: [{ description: "", bookings: [null] }],
      },
    ],
    [
      createSimpleTransaction,
      {
        accountBookId: "book-1",
        accountId: "a-1",
        counterAccountId: "a-2",
        date: BASE_DATE,
        description: "",
        amount: 10,
        direction: "OTHER",
      },
    ],
    [
      rebookBooking,
      { accountBookId: "book-1", bookingId: "b-1", targetAccountId: [] },
    ],
    [deleteTransaction, { accountBookId: "book-1", transactionId: null }],
  ])(
    "rejects malformed data before authorization, operations, or invalidation (%#)",
    async (mutation, data) => {
      await expect(mutation({ data })).rejects.toThrow();
      expect(ensureAuthorizedForAccountBookId).not.toHaveBeenCalled();
      expect(ensureSameOriginRequestFromServerContext).not.toHaveBeenCalled();
      expect(prisma.account.findMany).not.toHaveBeenCalled();
      expect(prisma.booking.count).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        invalidatePeriodBaseDataCacheForAccountBook,
      ).not.toHaveBeenCalled();
    },
  );
});
