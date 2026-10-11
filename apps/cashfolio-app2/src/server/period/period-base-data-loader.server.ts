import { toMoney } from "../../shared/money";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import { normalizePeriodValue } from "../../shared/period";
import { addUtcDays, startOfUtcDay } from "../../shared/date";
import { resolveExplicitCounterpartNonEquityAccounts } from "./period-gains-losses-contributions";
import { filterConvertibleHoldingAccounts } from "./period-helpers";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "./period-selection";

import {
  loadPeriodCashFlowTransactionsRaw,
  loadPeriodEquityBookingsRaw,
  loadPeriodHoldingTransactionsRaw,
} from "./period-base-data-queries.server";
import { loadTransferClearingUnitBuckets } from "./period-transfer-clearing";
import type { PeriodBaseData } from "./period-base-data-types";

export type { PeriodBaseData };

export async function loadPeriodBaseDataUncached(args: {
  accountBookId: string;
  period?: unknown;
}): Promise<PeriodBaseData> {
  const periodValue = normalizePeriodValue(args.period);

  const accountBook = await prisma.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: {
      referenceCurrency: true,
      startDate: true,
    },
  });

  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
  const [allAccountGroups, baseAssetLiabilityAccounts, equityAccounts] =
    await Promise.all([
      prisma.accountGroup.findMany({
        where: { accountBookId: args.accountBookId },
        select: {
          id: true,
          name: true,
          parentGroupId: true,
        },
      }),
      prisma.account.findMany({
        where: {
          accountBookId: args.accountBookId,
          type: {
            in: [AccountType.ASSET, AccountType.LIABILITY],
          },
        },
        select: {
          id: true,
          name: true,
          groupId: true,
          type: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          isCashAccount: true,
        },
      }),
      prisma.account.findMany({
        where: {
          accountBookId: args.accountBookId,
          type: AccountType.EQUITY,
          equityAccountSubtype: {
            in: [
              EquityAccountSubtype.INCOME,
              EquityAccountSubtype.EXPENSE,
              EquityAccountSubtype.GAIN_LOSS,
            ],
          },
        },
        select: {
          id: true,
          name: true,
          groupId: true,
          equityAccountSubtype: true,
        },
      }),
    ]);

  const accountBookStartDate = startOfUtcDay(accountBook.startDate);
  const selection = resolvePeriodSelection({
    periodValue,
    now: new Date(),
    firstBookingDate: accountBookStartDate,
  });
  const queryEndExclusive = getPeriodEndExclusive(selection.to);
  const queryStart = selection.from;
  const initialHoldingDate = addUtcDays(queryStart, -1);
  const isBeforeAccountBookStart = selection.to < accountBookStartDate;

  const holdingAccountsResolved = filterConvertibleHoldingAccounts(
    baseAssetLiabilityAccounts,
    referenceCurrency,
  );
  const assetLiabilityAccountIds = baseAssetLiabilityAccounts.map(
    (account) => account.id,
  );
  const holdingAccountIds = holdingAccountsResolved.map(
    (account) => account.id,
  );
  const cashAccountIds = baseAssetLiabilityAccounts
    .filter((account) => account.isCashAccount === true)
    .map((account) => account.id);
  const equityAccountIds = equityAccounts.map((account) => account.id);
  const equityAccountById = new Map(
    equityAccounts.map((account) => [account.id, account]),
  );

  const [endOfPeriodRawBalancesGrouped, transferClearingUnitBuckets] =
    await Promise.all([
      assetLiabilityAccountIds.length > 0
        ? prisma.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: args.accountBookId,
              accountId: { in: assetLiabilityAccountIds },
              date: { lt: queryEndExclusive },
            },
            _sum: { value: true },
          })
        : Promise.resolve([]),
      loadTransferClearingUnitBuckets({
        accountBookId: args.accountBookId,
        periodEndExclusive: queryEndExclusive,
        referenceCurrency,
      }),
    ]);

  const [
    equityBookings,
    initialHoldingBalancesGrouped,
    holdingTransactions,
    cashFlowTransactions,
  ] = await Promise.all([
    isBeforeAccountBookStart
      ? Promise.resolve([])
      : loadPeriodEquityBookingsRaw({
          accountBookId: args.accountBookId,
          queryStart,
          queryEndExclusive,
          equityAccountById,
          equityAccountIds,
        }),
    isBeforeAccountBookStart || holdingAccountIds.length === 0
      ? Promise.resolve([])
      : prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: holdingAccountIds },
            date: { lt: queryStart },
          },
          _sum: { value: true },
        }),
    isBeforeAccountBookStart
      ? Promise.resolve([])
      : loadPeriodHoldingTransactionsRaw({
          accountBookId: args.accountBookId,
          holdingAccountIds,
          queryStart,
          queryEndExclusive,
        }),
    isBeforeAccountBookStart
      ? Promise.resolve([])
      : loadPeriodCashFlowTransactionsRaw({
          accountBookId: args.accountBookId,
          cashAccountIds,
          queryStart,
          queryEndExclusive,
        }),
  ]);

  const explicitTransactionIds = Array.from(
    new Set(
      equityBookings
        .filter(
          (booking) =>
            booking.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS,
        )
        .map((booking) => booking.transactionId),
    ),
  );

  const explicitCounterpartByTransactionId = new Map<
    string,
    { id: string; name: string }
  >();
  if (explicitTransactionIds.length > 0) {
    await resolveExplicitCounterpartNonEquityAccounts({
      accountBookId: args.accountBookId,
      explicitTransactionIds,
      byTransactionId: explicitCounterpartByTransactionId,
    });
  }

  return {
    accountBookId: args.accountBookId,
    periodValue,
    referenceCurrency,
    selection: {
      periodValue: selection.periodValue,
      label: selection.label,
      periodSpecifier: selection.periodSpecifier,
      granularity: selection.granularity,
      year: selection.year,
      month: selection.month,
      from: selection.from,
      to: selection.to,
      queryEndExclusive,
      initialHoldingDate,
      isBeforeAccountBookStart,
      minPeriodDate: accountBookStartDate,
    },
    allAccountGroups,
    baseAssetLiabilityAccounts,
    holdingAccountsResolved,
    endOfPeriodRawBalances: endOfPeriodRawBalancesGrouped.map((row) => ({
      accountId: row.accountId,
      rawBalance: toMoney(row._sum.value ?? toMoney(0)),
    })),
    transferClearingUnitBuckets,
    equityBookings,
    explicitCounterparts: Array.from(
      explicitCounterpartByTransactionId.entries(),
    ).map(([transactionId, counterpart]) => ({
      transactionId,
      accountId: counterpart.id,
      accountName: counterpart.name,
    })),
    initialHoldingBalances: initialHoldingBalancesGrouped.map((row) => ({
      accountId: row.accountId,
      rawBalance: toMoney(row._sum.value ?? toMoney(0)),
    })),
    holdingTransactions,
    cashFlowTransactions,
    hasCashAccounts: cashAccountIds.length > 0,
  };
}
