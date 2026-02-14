import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";

export const getAccountForLedger = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { accountId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    return await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.accountId,
          accountBookId: data.accountBookId,
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        equityAccountSubtype: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });
  });

export const getLedgerData = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { accountId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    const bookings = await prisma.booking.findMany({
      where: {
        accountId: data.accountId,
        accountBookId: data.accountBookId,
      },
      orderBy: [
        { date: "asc" },
        { transaction: { createdAt: "asc" } },
        { id: "asc" },
      ],
      select: {
        id: true,
        date: true,
        description: true,
        value: true,
        transactionId: true,
        transaction: {
          select: {
            description: true,
            bookings: {
              where: {
                accountId: { not: data.accountId },
              },
              select: {
                account: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    return bookings.map((b) => ({
      id: b.id,
      date: b.date,
      description: b.description,
      value: Number(b.value),
      transactionId: b.transactionId,
      transactionDescription: b.transaction.description,
      counterpartyAccounts: [
        ...new Map(
          b.transaction.bookings.map((sb) => [sb.account.id, sb.account]),
        ).values(),
      ],
    }));
  });
