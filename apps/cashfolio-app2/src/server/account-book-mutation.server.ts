import { Prisma } from "../.prisma-client/client";
import { prisma } from "../prisma.server";

/** Serialize a book's mutations before reading state used by business rules. */
export async function withAccountBookMutation<T>(
  accountBookId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
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
}
