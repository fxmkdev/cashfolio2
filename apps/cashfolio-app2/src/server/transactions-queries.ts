import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { Unit } from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";

export const getTransaction = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { transactionId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.transactionId,
          accountBookId: data.accountBookId,
        },
      },
      include: {
        bookings: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
    });

    return {
      id: transaction.id,
      description: transaction.description,
      bookings: transaction.bookings.map((b) => {
        const value = Number(b.value);
        return {
          date: b.date.toISOString(),
          account: b.accountId,
          description: b.description,
          unit: b.unit as Unit,
          currency: b.currency ?? undefined,
          cryptocurrency: b.cryptocurrency ?? undefined,
          symbol: b.symbol ?? undefined,
          tradeCurrency: b.tradeCurrency ?? undefined,
          debit: value > 0 ? value : undefined,
          credit: value < 0 ? -value : undefined,
        };
      }),
    };
  });
