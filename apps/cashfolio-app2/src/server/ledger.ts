import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { Unit } from "../.prisma-client/enums";
import { getCurrencyExchangeRate } from "./fx.server";
import { format } from "date-fns";

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
        accountBook: {
          select: {
            referenceCurrency: true,
          },
        },
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

    const { groupId, accountBook, ...rest } = account;
    return {
      ...rest,
      referenceCurrency: accountBook.referenceCurrency,
      groupPathSegments: groupId ? getGroupPathSegments(groupId) : [],
    };
  });

export const getLedgerData = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const [account, bookings] = await Promise.all([
      prisma.account.findUniqueOrThrow({
        where: {
          id_accountBookId: {
            id: data.accountId,
            accountBookId: data.accountBookId,
          },
        },
        select: {
          unit: true,
          currency: true,
          accountBook: {
            select: {
              referenceCurrency: true,
            },
          },
        },
      }),
      prisma.booking.findMany({
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
      }),
    ]);

    const referenceCurrency =
      account.accountBook.referenceCurrency.toUpperCase();
    const exchangeRateByDateAndPair = new Map<string, number | null>();

    return Promise.all(
      bookings.map(async (b) => {
        const numericValue = Number(b.value);
        let valueInReferenceCurrency: number | null = null;

        if (account.unit === Unit.CURRENCY) {
          const sourceCurrency = (
            b.currency ?? account.currency
          )?.toUpperCase();
          if (sourceCurrency) {
            if (sourceCurrency === referenceCurrency) {
              valueInReferenceCurrency = numericValue;
            } else {
              const dateKey = format(b.date, "yyyy-MM-dd");
              const rateKey = `${sourceCurrency}->${referenceCurrency}:${dateKey}`;
              const cachedRate = exchangeRateByDateAndPair.get(rateKey);
              const exchangeRate =
                cachedRate !== undefined
                  ? cachedRate
                  : await getCurrencyExchangeRate({
                      sourceCurrency,
                      targetCurrency: referenceCurrency,
                      date: b.date,
                    });
              if (cachedRate === undefined) {
                exchangeRateByDateAndPair.set(rateKey, exchangeRate);
              }
              if (exchangeRate != null) {
                valueInReferenceCurrency = numericValue * exchangeRate;
              }
            }
          }
        }

        return {
          id: b.id,
          date: b.date,
          description: b.description,
          value: numericValue,
          valueInReferenceCurrency,
          unit: b.unit,
          currency: b.currency,
          cryptocurrency: b.cryptocurrency,
          symbol: b.symbol,
          transactionId: b.transactionId,
          transactionDescription: b.transaction.description,
          counterpartyAccounts: [
            ...new Map(
              b.transaction.bookings.map((sb) => [sb.account.id, sb.account]),
            ).values(),
          ],
        };
      }),
    );
  });
