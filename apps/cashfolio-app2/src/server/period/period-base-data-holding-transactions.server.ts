import { toMoney } from "../../shared/money";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";

import type { PeriodBaseHoldingTransaction } from "./period-base-data-types";

const TRANSACTIONS_PAGE_SIZE = 200;

type LoadPeriodHoldingTransactionsRawArgs = {
  accountBookId: string;
  holdingAccountIds: string[];
  queryStart: Date;
  queryEndExclusive: Date;
};

export async function loadPeriodHoldingTransactionsRaw(
  args: LoadPeriodHoldingTransactionsRawArgs,
): Promise<PeriodBaseHoldingTransaction[]> {
  const results: PeriodBaseHoldingTransaction[] = [];
  if (args.holdingAccountIds.length === 0) {
    return results;
  }

  let nextTransactionIdCursor: string | undefined;

  while (true) {
    const transactionsPage = await loadPeriodHoldingTransactionsPage({
      ...args,
      nextTransactionIdCursor,
    });
    if (transactionsPage.length === 0) {
      break;
    }

    results.push(...transactionsPage.map(mapPeriodHoldingTransaction));

    nextTransactionIdCursor = transactionsPage[transactionsPage.length - 1].id;
    if (transactionsPage.length < TRANSACTIONS_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

type PeriodHoldingTransactionsPage = Awaited<
  ReturnType<typeof loadPeriodHoldingTransactionsPage>
>;
type PeriodHoldingTransactionPageRow = PeriodHoldingTransactionsPage[number];

async function loadPeriodHoldingTransactionsPage(
  args: LoadPeriodHoldingTransactionsRawArgs & {
    nextTransactionIdCursor: string | undefined;
  },
) {
  return prisma.transaction.findMany({
    where: getHoldingTransactionsWhere(args),
    orderBy: { id: "asc" },
    take: TRANSACTIONS_PAGE_SIZE,
    ...(args.nextTransactionIdCursor
      ? {
          cursor: {
            id_accountBookId: {
              id: args.nextTransactionIdCursor,
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
              type: true,
              equityAccountSubtype: true,
            },
          },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      },
    },
  });
}

function getHoldingTransactionsWhere(
  args: LoadPeriodHoldingTransactionsRawArgs,
) {
  return {
    accountBookId: args.accountBookId,
    AND: [
      {
        bookings: {
          some: {
            accountId: {
              in: args.holdingAccountIds,
            },
            date: {
              gte: args.queryStart,
              lt: args.queryEndExclusive,
            },
          },
        },
      },
      {
        bookings: {
          none: {
            date: {
              gte: args.queryEndExclusive,
            },
          },
        },
      },
      getNoOpeningBalanceBookingsFilter(),
    ],
  };
}

function mapPeriodHoldingTransaction(
  transaction: PeriodHoldingTransactionPageRow,
): PeriodBaseHoldingTransaction {
  return {
    id: transaction.id,
    bookings: transaction.bookings.map((booking) => ({
      id: booking.id,
      accountId: booking.accountId,
      date: booking.date,
      value: toMoney(booking.value),
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      accountType: booking.account.type,
      equityAccountSubtype: booking.account.equityAccountSubtype,
    })),
  };
}

function getNoOpeningBalanceBookingsFilter() {
  return {
    bookings: {
      none: {
        account: {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      },
    },
  };
}
