import { prisma } from "../../../prisma.server";
import { toMoney } from "../../../shared/money";
import { ASSET_CLASS_SCHEME_ID } from "../../../shared/asset-class";
import { addUtcDays, startOfUtcDay } from "../../../shared/date";
import type { HoldingTransaction } from "../../period/holdings/period-overview-holdings-types";
import { checkResourceBudget } from "../../resource-context.server";

/** Read all required business data at one revision; future peers remain available for settlement bridges. */
export function loadAccountReturnInputs(
  accountBookId: string,
  asOfDate: Date,
  accountId?: string,
) {
  return prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SET TRANSACTION READ ONLY`;
      const [book, rawAccounts, groups, classes] = await Promise.all([
        db.accountBook.findUniqueOrThrow({
          where: { id: accountBookId },
          select: {
            startDate: true,
            referenceCurrency: true,
            periodCacheRevision: true,
          },
        }),
        db.account.findMany({
          where: { accountBookId, type: "BALANCE" },
          select: {
            id: true,
            name: true,
            groupId: true,
            isActive: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
            trackingMethod: true,
            classifications: {
              where: { schemeId: ASSET_CLASS_SCHEME_ID },
              select: { nodeId: true },
            },
          },
        }),
        db.accountGroup.findMany({
          where: { accountBookId, type: "BALANCE" },
          select: { id: true, name: true, parentGroupId: true, isActive: true },
        }),
        db.classificationNode.findMany({
          where: { accountBookId, schemeId: ASSET_CLASS_SCHEME_ID },
          select: { id: true, name: true, parentId: true, sortOrder: true },
        }),
      ]);
      const startDate = startOfUtcDay(book.startDate);
      const accounts = rawAccounts.map(({ classifications, ...account }) => ({
        ...account,
        assetClassId: classifications[0]?.nodeId ?? null,
      }));
      const opening = await db.booking.groupBy({
        by: ["accountId"],
        where: {
          accountBookId,
          accountId: { in: accounts.map((account) => account.id) },
          date: { lt: startDate },
        },
        _sum: { value: true },
      });
      const transactions: HoldingTransaction[] = [];
      let cursor: string | undefined;
      if (asOfDate >= startDate)
        while (true) {
          checkResourceBudget();
          const page = await db.transaction.findMany({
            where: {
              accountBookId,
              ...(accountId ? { bookings: { some: { accountId } } } : {}),
              AND: [
                { bookings: { some: { date: { gte: startDate } } } },
                {
                  bookings: { some: { date: { lt: addUtcDays(asOfDate, 1) } } },
                },
              ],
            },
            orderBy: { id: "asc" },
            take: 200,
            ...(cursor
              ? {
                  cursor: { id_accountBookId: { id: cursor, accountBookId } },
                  skip: 1,
                }
              : {}),
            select: {
              id: true,
              description: true,
              bookings: {
                orderBy: [{ date: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  accountId: true,
                  date: true,
                  description: true,
                  value: true,
                  unit: true,
                  currency: true,
                  cryptocurrency: true,
                  symbol: true,
                  tradeCurrency: true,
                  account: {
                    select: { type: true, equityAccountSubtype: true },
                  },
                },
              },
            },
          });
          for (const transaction of page)
            transactions.push({
              bookings: transaction.bookings.map(({ account, ...booking }) => ({
                ...booking,
                value: toMoney(booking.value),
                transactionId: transaction.id,
                transactionDescription: transaction.description,
                accountType: account.type,
                equityAccountSubtype: account.equityAccountSubtype,
              })),
            });
          if (page.length < 200) break;
          cursor = page.at(-1)!.id;
        }
      return {
        accounts,
        groups,
        classes,
        transactions,
        initialBalances: new Map(
          opening.map((row) => [row.accountId, toMoney(row._sum.value ?? 0)]),
        ),
        revision: book.periodCacheRevision,
        referenceCurrency: book.referenceCurrency.toUpperCase(),
        startDate: startDate.toISOString().slice(0, 10),
        asOfDate: asOfDate.toISOString().slice(0, 10),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}
