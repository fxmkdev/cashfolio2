import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import { filterConvertibleHoldingAccounts } from "./period-helpers";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "./period-overview-holdings";
import {
  addRunningUnrealizedGainLoss,
  pushDiagnostic,
  RECONCILIATION_TRANSACTIONS_PAGE_SIZE,
  toEmptySummary,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
  toSummary,
} from "./period-gain-loss-reconciliation-shared";
import type {
  GainLossReconciliationDetails,
  GainLossReconciliationDiagnostic,
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "./period-gain-loss-reconciliation-types";
import { formatUnitLabel, normalizeUppercaseCode } from "./period-unit-format";

export async function buildRealAccountReconciliation(args: {
  accountBookId: string;
  accountId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  initialHoldingDate: Date;
  periodEnd: Date;
  referenceCurrency: string;
  isBeforeAccountBookStart: boolean;
}): Promise<GainLossReconciliationDetails | null> {
  const account = await prisma.account.findFirst({
    where: {
      accountBookId: args.accountBookId,
      id: args.accountId,
      type: {
        in: [AccountType.ASSET, AccountType.LIABILITY],
      },
    },
    select: {
      id: true,
      name: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
    },
  });

  if (!account) {
    return null;
  }

  const [targetAccount] = filterConvertibleHoldingAccounts(
    [account],
    args.referenceCurrency,
  );
  if (!targetAccount) {
    return null;
  }

  const diagnostics: GainLossReconciliationDiagnostic[] = [];
  const realizedEvents: GainLossReconciliationRealizedEvent[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot[] = [];

  if (args.isBeforeAccountBookStart) {
    return {
      target: {
        accountId: targetAccount.id,
        accountName: account.name,
        isVirtual: false,
        unit: targetAccount.unit,
        unitLabel: formatUnitLabel(targetAccount),
        currency: normalizeUppercaseCode(targetAccount.currency),
        cryptocurrency: normalizeUppercaseCode(targetAccount.cryptocurrency),
        symbol: normalizeUppercaseCode(targetAccount.symbol),
        tradeCurrency: normalizeUppercaseCode(targetAccount.tradeCurrency),
      },
      summary: toEmptySummary(),
      skippedCount: 0,
      realizedEvents,
      unrealizedOpenLots,
      diagnostics,
    };
  }

  const initialHoldingBalances = await prisma.booking.groupBy({
    by: ["accountId"],
    where: {
      accountBookId: args.accountBookId,
      accountId: targetAccount.id,
      date: { lt: args.queryStart },
    },
    _sum: { value: true },
  });
  const initialHoldingBalanceByAccountId = new Map(
    initialHoldingBalances.map((balance) => [
      balance.accountId,
      Number(balance._sum.value ?? 0),
    ]),
  );

  const exchangeRateByKey = new Map<string, Promise<number | null>>();

  const state = await initializeHoldingGainLossState({
    holdingAccounts: [targetAccount],
    initialBalanceByAccountId: initialHoldingBalanceByAccountId,
    initialRateDate: args.initialHoldingDate,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onSkippedItem: (item) => {
      pushDiagnostic(diagnostics, item);
    },
  });

  let nextTransactionIdCursor: string | undefined;
  while (true) {
    const transactionsPage = await prisma.transaction.findMany({
      where: {
        accountBookId: args.accountBookId,
        AND: [
          {
            bookings: {
              some: {
                accountId: targetAccount.id,
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
        ],
      },
      orderBy: { id: "asc" },
      take: RECONCILIATION_TRANSACTIONS_PAGE_SIZE,
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
        description: true,
        bookings: {
          select: {
            id: true,
            description: true,
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

    if (transactionsPage.length === 0) {
      break;
    }

    nextTransactionIdCursor = transactionsPage[transactionsPage.length - 1].id;

    await applyHoldingTransactionsToGainLossState({
      state,
      transactions: transactionsPage.map((transaction) => ({
        bookings: transaction.bookings.map((booking) => ({
          id: booking.id,
          description: booking.description,
          transactionDescription: transaction.description,
          transactionId: transaction.id,
          accountId: booking.accountId,
          date: booking.date,
          value: Number(booking.value),
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          accountType: booking.account.type,
          equityAccountSubtype: booking.account.equityAccountSubtype,
        })),
      })),
      periodStart: args.queryStart,
      periodEndExclusive: args.queryEndExclusive,
      convertBookingToReference: (booking) =>
        convertBookingValueToReference({
          ...booking,
          referenceCurrency: args.referenceCurrency,
          exchangeRateByKey,
        }),
      onSkippedItem: (item) => {
        pushDiagnostic(diagnostics, item);
      },
    });

    if (transactionsPage.length < RECONCILIATION_TRANSACTIONS_PAGE_SIZE) {
      break;
    }
  }

  const split = await finalizeHoldingGainLossState({
    state,
    periodEnd: args.periodEnd,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onAccountExecutionEvent: (event) => {
      realizedEvents.push(toRoundedRealizedEvent(event));
    },
    onAccountOpenLotValuation: (lot) => {
      unrealizedOpenLots.push(toRoundedOpenLot(lot));
    },
    onSkippedItem: (item) => {
      pushDiagnostic(diagnostics, item);
    },
  });

  return {
    target: {
      accountId: targetAccount.id,
      accountName: account.name,
      isVirtual: false,
      unit: targetAccount.unit,
      unitLabel: formatUnitLabel(targetAccount),
      currency: normalizeUppercaseCode(targetAccount.currency),
      cryptocurrency: normalizeUppercaseCode(targetAccount.cryptocurrency),
      symbol: normalizeUppercaseCode(targetAccount.symbol),
      tradeCurrency: normalizeUppercaseCode(targetAccount.tradeCurrency),
    },
    summary: toSummary({
      realizedGainLoss: split.realizedGainLoss,
      unrealizedGainLoss: split.unrealizedGainLoss,
    }),
    skippedCount: split.skippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  };
}
