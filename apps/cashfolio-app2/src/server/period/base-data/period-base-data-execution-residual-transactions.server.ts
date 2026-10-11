import {
  AccountType,
  EquityAccountSubtype,
} from "../../../.prisma-client/enums";
import { prisma } from "../../../prisma.server";
import { toMoney } from "../../../shared/money";
import type { PeriodBaseExecutionResidualTransaction } from "./period-base-data-types";

const TRANSACTIONS_PAGE_SIZE = 200;

export async function loadPeriodExecutionResidualTransactionsRaw(args: {
  accountBookId: string;
  periodStart: Date;
  periodEndExclusive: Date;
}): Promise<PeriodBaseExecutionResidualTransaction[]> {
  const results: PeriodBaseExecutionResidualTransaction[] = [];
  let nextTransactionIdCursor: string | undefined;
  while (true) {
    const transactionsPage = await prisma.transaction.findMany({
      where: {
        accountBookId: args.accountBookId,
        AND: [
          {
            bookings: {
              some: {
                date: {
                  gte: args.periodStart,
                  lt: args.periodEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              some: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: {
                    in: [
                      EquityAccountSubtype.INCOME,
                      EquityAccountSubtype.EXPENSE,
                    ],
                  },
                },
              },
            },
          },
          {
            bookings: {
              none: {
                date: {
                  gte: args.periodEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
                },
              },
            },
          },
        ],
      },
      orderBy: { id: "asc" },
      take: TRANSACTIONS_PAGE_SIZE,
      ...(nextTransactionIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextTransactionIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        bookings: {
          select: {
            id: true,
            accountId: true,
            date: true,
            value: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
            account: {
              select: {
                name: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        },
      },
    });

    if (transactionsPage.length === 0) break;
    results.push(
      ...transactionsPage.map((transaction) => ({
        ...transaction,
        bookings: transaction.bookings.map((booking) => ({
          ...booking,
          value: toMoney(booking.value),
        })),
      })),
    );
    nextTransactionIdCursor = transactionsPage[transactionsPage.length - 1].id;
    if (transactionsPage.length < TRANSACTIONS_PAGE_SIZE) break;
  }
  return results;
}
