import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import { toMoneyNumber } from "../../shared/money";
import type { PeriodBaseCashFlowTransaction } from "./period-base-data-types";

const TRANSACTIONS_PAGE_SIZE = 200;

type LoadPeriodCashFlowTransactionsRawArgs = {
  accountBookId: string;
  cashAccountIds: string[];
  queryStart: Date;
  queryEndExclusive: Date;
};

export async function loadPeriodCashFlowTransactionsRaw(
  args: LoadPeriodCashFlowTransactionsRawArgs,
): Promise<PeriodBaseCashFlowTransaction[]> {
  const results: PeriodBaseCashFlowTransaction[] = [];
  if (args.cashAccountIds.length === 0) {
    return results;
  }

  let nextTransactionIdCursor: string | undefined;

  while (true) {
    const transactionsPage = await loadPeriodCashFlowTransactionsPage({
      ...args,
      nextTransactionIdCursor,
    });
    if (transactionsPage.length === 0) {
      break;
    }

    results.push(...transactionsPage.map(mapPeriodCashFlowTransaction));

    nextTransactionIdCursor = transactionsPage[transactionsPage.length - 1].id;
    if (transactionsPage.length < TRANSACTIONS_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

type PeriodCashFlowTransactionsPage = Awaited<
  ReturnType<typeof loadPeriodCashFlowTransactionsPage>
>;
type PeriodCashFlowTransactionPageRow = PeriodCashFlowTransactionsPage[number];

async function loadPeriodCashFlowTransactionsPage(
  args: LoadPeriodCashFlowTransactionsRawArgs & {
    nextTransactionIdCursor: string | undefined;
  },
) {
  return prisma.transaction.findMany({
    where: getCashFlowTransactionsWhere(args),
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
          date: true,
          value: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          account: {
            select: {
              id: true,
              name: true,
              groupId: true,
              type: true,
              isCashAccount: true,
            },
          },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      },
    },
  });
}

function getCashFlowTransactionsWhere(
  args: LoadPeriodCashFlowTransactionsRawArgs,
) {
  return {
    accountBookId: args.accountBookId,
    AND: [
      {
        bookings: {
          some: {
            accountId: { in: args.cashAccountIds },
            date: {
              gte: args.queryStart,
              lt: args.queryEndExclusive,
            },
          },
        },
      },
      getNoOpeningBalanceBookingsFilter(),
    ],
  };
}

function mapPeriodCashFlowTransaction(
  transaction: PeriodCashFlowTransactionPageRow,
): PeriodBaseCashFlowTransaction {
  return {
    id: transaction.id,
    bookings: transaction.bookings.map((booking) => ({
      id: booking.id,
      date: booking.date,
      value: toMoneyNumber(booking.value),
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      account: {
        id: booking.account.id,
        name: booking.account.name,
        groupId: booking.account.groupId,
        type: booking.account.type,
        isCashAccount: booking.account.isCashAccount,
      },
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
