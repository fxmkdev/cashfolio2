import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";

export const getAccountForLedger = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.accountId,
          accountBookId: data.accountBookId,
        },
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        type: true,
        equityAccountSubtype: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        groupId: true,
      },
    });

    const allGroups = await prisma.accountGroup.findMany({
      where: { accountBookId: data.accountBookId },
      select: { id: true, name: true, parentGroupId: true },
    });

    function getGroupPathSegments(groupId: string): string[] {
      const group = allGroups.find((g) => g.id === groupId);
      if (!group) return [];
      const parentSegments = group.parentGroupId
        ? getGroupPathSegments(group.parentGroupId)
        : [];
      return [...parentSegments, group.name];
    }

    const { groupId, ...rest } = account;
    return {
      ...rest,
      groupPathSegments: groupId ? getGroupPathSegments(groupId) : [],
    };
  });

export const getLedgerData = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        transactionId: true,
        transaction: {
          select: {
            description: true,
            bookings: {
              where: {
                accountId: { not: data.accountId },
              },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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
      unit: b.unit,
      currency: b.currency,
      cryptocurrency: b.cryptocurrency,
      symbol: b.symbol,
      tradeCurrency: b.tradeCurrency,
      transactionId: b.transactionId,
      transactionDescription: b.transaction.description,
      counterpartyAccounts: [
        ...new Map(
          b.transaction.bookings.map((sb) => [sb.account.id, sb.account]),
        ).values(),
      ],
    }));
  });
