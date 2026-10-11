import { Prisma } from "../.prisma-client/client";
import { prisma } from "../prisma.server";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "../shared/mutation-errors";

function isLockTimeout(error: unknown): boolean {
  if (error instanceof Error && "code" in error && error.code === "55P03")
    return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const adapterError = error.meta?.driverAdapterError as
    { cause?: { originalCode?: string } } | undefined;
  return (
    error.meta?.code === "55P03" ||
    adapterError?.cause?.originalCode === "55P03"
  );
}

/** Serialize a book's mutations before reading state used by business rules. */
export async function withAccountBookMutation<T>(
  accountBookId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '25s'`;
        const books = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "AccountBook" WHERE id = ${accountBookId} FOR UPDATE
      `;
        if (books.length === 0) {
          throw new Error("Account book was not found.");
        }
        return operation(tx);
      },
      // Each statement after the lock must see the preceding writer's commit.
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 30_000,
      },
    );
  } catch (error) {
    // The transaction promise rejects only after rollback has completed.
    if (isLockTimeout(error))
      throw new Error(ACCOUNT_BOOK_BUSY_MESSAGE, { cause: error });
    throw error;
  }
}
