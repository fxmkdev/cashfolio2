import {
  assetClassSelection,
  withAssetClassId,
} from "../../classification-data";
import { toMoney } from "../../../shared/money";
import {
  AccountType,
  EquityAccountSubtype,
} from "../../../.prisma-client/enums";
import { prisma } from "../../../prisma.server";
import { normalizePeriodValue } from "../../../shared/period";
import { addUtcDays, startOfUtcDay } from "../../../shared/date";
import { resolveExplicitCounterpartNonEquityAccounts } from "./period-base-data-explicit-counterparts.server";
import { filterConvertibleHoldingAccounts } from "../period-helpers";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "../period-selection";

import {
  loadPeriodCashFlowTransactionsRaw,
  loadPeriodEquityBookingsRaw,
  loadPeriodHoldingTransactionsRaw,
  loadPeriodExecutionResidualTransactionsRaw,
} from "./period-base-data-queries.server";
import { loadTransferClearingUnitBuckets } from "../transfer-clearing/period-transfer-clearing";
import type { PeriodBaseData } from "./period-base-data-types";
import type { PeriodReadClient } from "./period-read-client";

export type { PeriodBaseData };

type PeriodBaseDataInput = {
  accountBookId: string;
  period?: unknown;
};

export type PeriodBaseDataSnapshot = {
  data: PeriodBaseData;
  revision: string;
};

export async function loadPeriodBaseDataUncached(
  args: PeriodBaseDataInput,
): Promise<PeriodBaseData> {
  return (await loadPeriodBaseDataSnapshot(args)).data;
}

/** Only database loading runs here; calculations and external I/O run afterward. */
export async function loadPeriodBaseDataSnapshot(
  args: PeriodBaseDataInput,
): Promise<PeriodBaseDataSnapshot> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return loadPeriodBaseDataFromClient(args, tx);
    },
    {
      isolationLevel: "RepeatableRead",
      timeout: 30_000,
    },
  );
}

async function loadPeriodBaseDataFromClient(
  args: PeriodBaseDataInput,
  db: PeriodReadClient,
): Promise<PeriodBaseDataSnapshot> {
  const periodValue = normalizePeriodValue(args.period);

  const accountBook = await db.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: {
      referenceCurrency: true,
      startDate: true,
      periodCacheRevision: true,
      classificationSchemes: {
        where: { id: "assetClass" },
        select: {
          nodes: {
            select: { id: true, name: true, parentId: true, sortOrder: true },
          },
        },
      },
    },
  });

  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
  const [allAccountGroups, baseAssetLiabilityAccounts, allEquityAccounts] =
    await Promise.all([
      db.accountGroup.findMany({
        where: { accountBookId: args.accountBookId },
        select: {
          id: true,
          name: true,
          parentGroupId: true,
        },
      }),
      db.account.findMany({
        where: {
          accountBookId: args.accountBookId,
          type: {
            in: [AccountType.BALANCE],
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
          classifications: assetClassSelection,
          trackingMethod: true,

        },
      }),
      db.account.findMany({
        where: {
          accountBookId: args.accountBookId,
          type: AccountType.EQUITY,
          equityAccountSubtype: {
            in: [
              EquityAccountSubtype.INCOME,
              EquityAccountSubtype.EXPENSE,
              EquityAccountSubtype.GAIN_LOSS,
              EquityAccountSubtype.OPENING_BALANCES,
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
  // Resolve subtype filters once in this snapshot. Joining Account inside each
  // transaction-page exclusion can make PostgreSQL rescan the whole book for
  // every candidate when a newly inserted book has no planner statistics yet.
  const openingBalanceAccountIds = allEquityAccounts
    .filter(
      (account) =>
        account.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES,
    )
    .map((account) => account.id);
  const equityAccounts = allEquityAccounts.filter(
    (account) =>
      account.equityAccountSubtype !== EquityAccountSubtype.OPENING_BALANCES,
  );
  const incomeExpenseAccountIds = equityAccounts
    .filter(
      (account) =>
        account.equityAccountSubtype === EquityAccountSubtype.INCOME ||
        account.equityAccountSubtype === EquityAccountSubtype.EXPENSE,
    )
    .map((account) => account.id);
  const excludedExecutionAccountIds = allEquityAccounts
    .filter(
      (account) =>
        account.equityAccountSubtype ===
          EquityAccountSubtype.OPENING_BALANCES ||
        account.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS,
    )
    .map((account) => account.id);
  const equityAccountIds = equityAccounts.map((account) => account.id);
  const equityAccountById = new Map(
    equityAccounts.map((account) => [account.id, account]),
  );

  const [endOfPeriodRawBalancesGrouped, transferClearingUnitBuckets] =
    await Promise.all([
      assetLiabilityAccountIds.length > 0
        ? db.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: args.accountBookId,
              accountId: { in: assetLiabilityAccountIds },
              date: { lt: queryEndExclusive },
            },
            _sum: { value: true },
          })
        : Promise.resolve([]),
      loadTransferClearingUnitBuckets(
        {
          accountBookId: args.accountBookId,
          periodEndExclusive: queryEndExclusive,
          referenceCurrency,
        },
        db,
      ),
    ]);

  const [
    equityBookings,
    initialHoldingBalancesGrouped,
    holdingTransactions,
    cashFlowTransactions,
    executionResidualTransactions,
  ] = await Promise.all([
    isBeforeAccountBookStart
      ? Promise.resolve([])
      : loadPeriodEquityBookingsRaw(
          {
            accountBookId: args.accountBookId,
            queryStart,
            queryEndExclusive,
            equityAccountById,
            equityAccountIds,
          },
          db,
        ),
    isBeforeAccountBookStart || holdingAccountIds.length === 0
      ? Promise.resolve([])
      : db.booking.groupBy({
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
      : loadPeriodHoldingTransactionsRaw(
          {
            accountBookId: args.accountBookId,
            holdingAccountIds,
            openingBalanceAccountIds,
            queryStart,
            queryEndExclusive,
          },
          db,
        ),
    isBeforeAccountBookStart
      ? Promise.resolve([])
      : loadPeriodCashFlowTransactionsRaw(
          {
            accountBookId: args.accountBookId,
            cashAccountIds,
            openingBalanceAccountIds,
            queryStart,
            queryEndExclusive,
          },
          db,
        ),
    isBeforeAccountBookStart
      ? Promise.resolve([])
      : loadPeriodExecutionResidualTransactionsRaw(
          {
            accountBookId: args.accountBookId,
            periodStart: queryStart,
            periodEndExclusive: queryEndExclusive,
            incomeExpenseAccountIds,
            excludedAccountIds: excludedExecutionAccountIds,
          },
          db,
        ),
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
    await resolveExplicitCounterpartNonEquityAccounts(
      {
        accountBookId: args.accountBookId,
        explicitTransactionIds,
        byTransactionId: explicitCounterpartByTransactionId,
      },
      db,
    );
  }

  return {
    revision: accountBook.periodCacheRevision,
    data: {
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
      baseAssetLiabilityAccounts:
        baseAssetLiabilityAccounts.map(withAssetClassId),
      assetClasses: accountBook.classificationSchemes.flatMap(
        (scheme) => scheme.nodes,
      ),
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
      executionResidualTransactions,
      hasCashAccounts: cashAccountIds.length > 0,
    },
  };
}
