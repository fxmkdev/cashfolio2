import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import { moneyAdd, toMoneyNumber } from "../../shared/money";
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
import { toHoldingUnitIdentifier } from "./period-overview-holdings-transfer";
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

  const siblingAccounts = await prisma.account.findMany({
    where: {
      accountBookId: args.accountBookId,
      type: {
        in: [AccountType.ASSET, AccountType.LIABILITY],
      },
    },
    select: {
      id: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
    },
  });
  const siblingHoldingAccounts = filterConvertibleHoldingAccounts(
    siblingAccounts,
    args.referenceCurrency,
  );
  const targetUnitIdentifier = toHoldingUnitIdentifier({
    unit: targetAccount.unit,
    currency: targetAccount.currency,
    cryptocurrency: targetAccount.cryptocurrency,
    symbol: targetAccount.symbol,
    tradeCurrency: targetAccount.tradeCurrency,
  });
  const trackedHoldingAccounts = siblingHoldingAccounts.filter(
    (holdingAccount) =>
      toHoldingUnitIdentifier({
        unit: holdingAccount.unit,
        currency: holdingAccount.currency,
        cryptocurrency: holdingAccount.cryptocurrency,
        symbol: holdingAccount.symbol,
        tradeCurrency: holdingAccount.tradeCurrency,
      }) === targetUnitIdentifier,
  );
  const targetTrackedHoldingAccounts =
    trackedHoldingAccounts.length > 0
      ? trackedHoldingAccounts
      : [targetAccount];
  const trackedHoldingAccountIds = targetTrackedHoldingAccounts.map(
    (holdingAccount) => holdingAccount.id,
  );

  const initialHoldingBalances = await prisma.booking.groupBy({
    by: ["accountId"],
    where: {
      accountBookId: args.accountBookId,
      accountId: {
        in: trackedHoldingAccountIds,
      },
      date: { lt: args.queryStart },
    },
    _sum: { value: true },
  });
  const initialHoldingBalanceByAccountId = new Map(
    initialHoldingBalances.map((balance) => [
      balance.accountId,
      toMoneyNumber(balance._sum.value ?? 0),
    ]),
  );

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  let targetSkippedCount = 0;
  let targetRealizedGainLoss = 0;
  let targetUnrealizedGainLoss = 0;

  const state = await initializeHoldingGainLossState({
    holdingAccounts: targetTrackedHoldingAccounts,
    initialBalanceByAccountId: initialHoldingBalanceByAccountId,
    initialRateDate: args.initialHoldingDate,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onSkippedItem: (item) => {
      if (item.accountId !== targetAccount.id) {
        return;
      }
      targetSkippedCount += 1;
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
          value: toMoneyNumber(booking.value),
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
        if (item.accountId !== targetAccount.id) {
          return;
        }
        targetSkippedCount += 1;
        pushDiagnostic(diagnostics, item);
      },
    });

    if (transactionsPage.length < RECONCILIATION_TRANSACTIONS_PAGE_SIZE) {
      break;
    }
  }

  await finalizeHoldingGainLossState({
    state,
    periodEnd: args.periodEnd,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onAccountGainLoss: (gainLossByAccount) => {
      if (gainLossByAccount.accountId !== targetAccount.id) {
        return;
      }
      targetRealizedGainLoss = toMoneyNumber(
        moneyAdd(targetRealizedGainLoss, gainLossByAccount.realizedGainLoss),
      );
      targetUnrealizedGainLoss = toMoneyNumber(
        moneyAdd(
          targetUnrealizedGainLoss,
          gainLossByAccount.unrealizedGainLoss,
        ),
      );
    },
    onAccountExecutionEvent: (event) => {
      if (event.accountId !== targetAccount.id) {
        return;
      }
      realizedEvents.push(toRoundedRealizedEvent(event));
    },
    onAccountOpenLotValuation: (lot) => {
      if (lot.accountId !== targetAccount.id) {
        return;
      }
      unrealizedOpenLots.push(toRoundedOpenLot(lot));
    },
    onSkippedItem: (item) => {
      if (item.accountId !== targetAccount.id) {
        return;
      }
      targetSkippedCount += 1;
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
      realizedGainLoss: targetRealizedGainLoss,
      unrealizedGainLoss: targetUnrealizedGainLoss,
    }),
    skippedCount: targetSkippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  };
}
