import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "../../.prisma-client/client";
import {
  cleanupTransactionMutation,
  createTransactionInput,
  deleteTransaction,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  resetTransactionMutation,
  updateTransaction,
} from "./transactions-mutations.test-support";

describe("transactions mutations", () => {
  beforeEach(resetTransactionMutation);
  afterEach(cleanupTransactionMutation);

  it("recreates transaction edit queries after a deadlock and cleans up only after commit", async () => {
    prisma.transaction.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock", {
        code: "P2034",
        clientVersion: "test",
      }),
    );
    await updateTransaction({
      data: { ...createTransactionInput(), transactionId: "tx-1" },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const first = prisma.$transaction.mock.calls[0]![0];
    const second = prisma.$transaction.mock.calls[1]![0];
    expect(second).not.toBe(first);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.booking.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.update).toHaveBeenCalledTimes(2);
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledOnce();
    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledOnce();
    expect(
      invalidatePeriodBaseDataCacheForAccountBook,
    ).toHaveBeenCalledExactlyOnceWith("book-1");
  });

  it("does not retry a commit when post-commit cleanup fails", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("cleanup failure", {
      code: "P2034",
      clientVersion: "test",
    });
    invalidatePeriodBaseDataCacheForAccountBook.mockRejectedValueOnce(error);
    await expect(
      deleteTransaction({
        data: { accountBookId: "book-1", transactionId: "tx-1" },
      }),
    ).rejects.toBe(error);
    expect(prisma.transaction.delete).toHaveBeenCalledOnce();
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledOnce();
  });
});
