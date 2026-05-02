import { createServerFn } from "@tanstack/react-start";
import { AccountType } from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
  type PeriodPresetValue,
} from "../shared/period";
import { addUtcDays, startOfUtcDay } from "../shared/date";
import {
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  filterConvertibleHoldingAccounts,
  isMultiUnitTransaction,
  shouldIncludeTransactionForPeriod,
} from "./period-helpers";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
  type PeriodSpecifier,
} from "./period-selection";
import {
  computeEndOfPeriodBalanceStats,
  computeEndOfPeriodBalanceStatsWithConvertedBalances,
} from "./period-balance-stats";
import { type GainLossContributionAccumulator } from "./period-gains-losses-contributions";
import { computePeriodHoldingGainLoss } from "./period-holding-gain-loss";
import { processPeriodEquityBookings } from "./period-equity-bookings";
import { createPeriodOverviewEquityAggregation } from "./period-overview-aggregation";
import {
  buildTransferClearingVirtualHierarchy,
  loadTransferClearingUnitBuckets,
} from "./period-transfer-clearing";
import { buildPeriodOverviewResponse } from "./period-overview-response";

export {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
};
export type { PeriodPresetValue };
export type { PeriodSpecifier };
export {
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeEndOfPeriodBalanceStats,
  getPeriodEndExclusive,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  isMultiUnitTransaction,
  resolvePeriodSelection,
  shouldIncludeTransactionForPeriod,
};

const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;
const TRANSACTIONS_PAGE_SIZE = 200;
const TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE = 200;

export const getPeriodOverview = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string; period?: unknown }) => ({
    accountBookId: data.accountBookId,
    period: normalizePeriodValue(data.period),
  }))
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    });

    const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
    const [allAccountGroups, baseAssetLiabilityAccounts] = await Promise.all([
      prisma.accountGroup.findMany({
        where: { accountBookId: data.accountBookId },
        select: {
          id: true,
          name: true,
          parentGroupId: true,
        },
      }),
      prisma.account.findMany({
        where: {
          accountBookId: data.accountBookId,
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
        },
      }),
    ]);
    const assetLiabilityAccountNameById = new Map(
      baseAssetLiabilityAccounts.map((account) => [account.id, account.name]),
    );

    const holdingAccountsResolved = filterConvertibleHoldingAccounts(
      baseAssetLiabilityAccounts,
      referenceCurrency,
    );

    const accountBookStartDate = startOfUtcDay(accountBook.startDate);
    const minPeriodDate = accountBookStartDate;

    const selection = resolvePeriodSelection({
      periodValue: data.period,
      now: new Date(),
      firstBookingDate: minPeriodDate,
    });
    const isBeforeAccountBookStart = selection.to < accountBookStartDate;

    const queryStart = selection.from;
    const queryEndExclusive = getPeriodEndExclusive(selection.to);
    const initialHoldingDate = addUtcDays(queryStart, -1);

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    const assetLiabilityAccountIds = baseAssetLiabilityAccounts.map(
      (account) => account.id,
    );
    const endOfPeriodRawBalanceByAccountId = new Map(
      (assetLiabilityAccountIds.length > 0
        ? await prisma.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: data.accountBookId,
              accountId: { in: assetLiabilityAccountIds },
              date: { lt: queryEndExclusive },
            },
            _sum: { value: true },
          })
        : []
      ).map((balance) => [balance.accountId, Number(balance._sum.value ?? 0)]),
    );
    const transferClearingUnitBuckets = await loadTransferClearingUnitBuckets({
      accountBookId: data.accountBookId,
      periodEndExclusive: queryEndExclusive,
      referenceCurrency,
    });
    const {
      virtualGroups: transferClearingVirtualGroups,
      virtualAccounts: transferClearingVirtualAccounts,
      rawBalanceByVirtualAccountId,
    } = buildTransferClearingVirtualHierarchy({
      unitBuckets: transferClearingUnitBuckets,
    });
    const transferClearingUnitLabelByHoldingAccountId = new Map(
      transferClearingUnitBuckets
        .filter((bucket) => bucket.isNonReferenceUnit)
        .map((bucket) => [
          `virtual:transfer-clearing:account:${bucket.unitKey}`,
          bucket.unitLabel,
        ]),
    );
    const transferClearingHoldingAccounts = transferClearingUnitBuckets
      .filter((bucket) => bucket.isNonReferenceUnit)
      .map((bucket) => ({
        id: `virtual:transfer-clearing:account:${bucket.unitKey}`,
        unit: bucket.unit,
        currency: bucket.currency,
        cryptocurrency: bucket.cryptocurrency,
        symbol: bucket.symbol,
        tradeCurrency: bucket.tradeCurrency,
      }));

    const groupById = new Map(
      allAccountGroups.map((group) => [group.id, group]),
    );
    for (const virtualGroup of transferClearingVirtualGroups) {
      groupById.set(virtualGroup.id, virtualGroup);
    }

    const assetLiabilityAccounts = [
      ...baseAssetLiabilityAccounts,
      ...transferClearingVirtualAccounts,
    ];
    for (const virtualAccount of transferClearingVirtualAccounts) {
      assetLiabilityAccountNameById.set(virtualAccount.id, virtualAccount.name);
    }
    for (const [
      holdingAccountId,
      unitLabel,
    ] of transferClearingUnitLabelByHoldingAccountId) {
      if (assetLiabilityAccountNameById.has(holdingAccountId)) {
        continue;
      }
      assetLiabilityAccountNameById.set(holdingAccountId, unitLabel);
    }
    // Intentionally keep posted real-account balances: virtual transfer-clearing
    // accounts represent the missing counterpart leg with opposite sign.
    for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
      endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
    }

    let bookingsCount = 0;
    let convertedBookingsCount = 0;
    let skippedBookingsCount = 0;

    const equityAggregation = createPeriodOverviewEquityAggregation();
    const gainsLossesContributionByKey = new Map<
      string,
      GainLossContributionAccumulator
    >();
    let realizedGainLoss = 0;
    let unrealizedGainLoss = 0;

    if (!isBeforeAccountBookStart) {
      const equityBookingTotals = await processPeriodEquityBookings({
        accountBookId: data.accountBookId,
        periodStart: queryStart,
        periodEndExclusive: queryEndExclusive,
        pageSize: EQUITY_BOOKINGS_PAGE_SIZE,
        equityAggregation,
        gainsLossesContributionByKey,
        convertBookingToReference: (booking) =>
          convertBookingValueToReference({
            ...booking,
            referenceCurrency,
            exchangeRateByKey,
          }),
      });
      bookingsCount += equityBookingTotals.bookingsCount;
      convertedBookingsCount += equityBookingTotals.convertedCount;
      skippedBookingsCount += equityBookingTotals.skippedCount;

      const holdingGainLossTotals = await computePeriodHoldingGainLoss({
        accountBookId: data.accountBookId,
        periodStart: queryStart,
        periodEndExclusive: queryEndExclusive,
        periodEnd: selection.to,
        initialHoldingDate,
        referenceCurrency,
        transactionPageSize: TRANSACTIONS_PAGE_SIZE,
        transferClearingBatchSize: TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE,
        holdingAccounts: holdingAccountsResolved,
        transferClearingHoldingAccounts,
        transferClearingUnitBuckets,
        assetLiabilityAccountNameById,
        gainsLossesContributionByKey,
        resolveRate: (input) =>
          getUnitToReferenceExchangeRate({
            ...input,
            referenceCurrency,
            exchangeRateByKey,
          }),
        convertBookingToReference: (booking) =>
          convertBookingValueToReference({
            ...booking,
            referenceCurrency,
            exchangeRateByKey,
          }),
      });
      realizedGainLoss += holdingGainLossTotals.realizedGainLoss;
      unrealizedGainLoss += holdingGainLossTotals.unrealizedGainLoss;
      convertedBookingsCount += holdingGainLossTotals.convertedCount;
      skippedBookingsCount += holdingGainLossTotals.skippedCount;
    }

    const endOfPeriodBalanceStats =
      await computeEndOfPeriodBalanceStatsWithConvertedBalances({
        accounts: assetLiabilityAccounts,
        rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
        periodEnd: selection.to,
        referenceCurrency,
        convertBalanceToReference: async (input) =>
          convertBookingValueToReference({
            ...input,
            exchangeRateByKey,
          }),
      });
    skippedBookingsCount += endOfPeriodBalanceStats.skippedCount;

    const currentDay = startOfUtcDay(new Date());
    return buildPeriodOverviewResponse({
      selection,
      minPeriodDate,
      currentDay,
      referenceCurrency,
      groupById,
      assetLiabilityAccounts,
      equityAggregation,
      realizedGainLoss,
      unrealizedGainLoss,
      isBeforeAccountBookStart,
      endOfPeriodBalanceStats,
      bookingsCount,
      convertedBookingsCount,
      skippedBookingsCount,
      gainsLossesContributions: Array.from(
        gainsLossesContributionByKey.values(),
      ),
    });
  });
