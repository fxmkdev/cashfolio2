import { startOfUtcDay } from "../shared/date";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "./period-balance-stats";
import {
  getOrLoadPeriodBaseData,
  type PeriodBaseData,
} from "./period-base-data-cache";
import { computePeriodHoldingGainLoss } from "./period-holding-gain-loss";
import { createPeriodOverviewEquityAggregation } from "./period-overview-aggregation";
import { processPeriodEquityBookingsFromBaseData } from "./period-equity-bookings";
import { type GainLossContributionAccumulator } from "./period-gains-losses-contributions";
import { buildTransferClearingVirtualHierarchy } from "./period-transfer-clearing";
import { buildPeriodOverviewResponse } from "./period-overview-response";

const TRANSACTIONS_PAGE_SIZE = 200;
const TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE = 200;

export async function loadPeriodOverview(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
}) {
  const baseData =
    args.baseData ??
    (await getOrLoadPeriodBaseData({
      accountBookId: args.accountBookId,
      period: args.period,
    }));

  const referenceCurrency = baseData.referenceCurrency;
  const selection = baseData.selection;
  const minPeriodDate = selection.minPeriodDate;
  const currentDay = startOfUtcDay(new Date());
  const queryStart = selection.from;
  const queryEndExclusive = selection.queryEndExclusive;
  const initialHoldingDate = selection.initialHoldingDate;
  const isBeforeAccountBookStart = selection.isBeforeAccountBookStart;

  const assetLiabilityAccountNameById = new Map(
    baseData.baseAssetLiabilityAccounts.map((account) => [
      account.id,
      account.name,
    ]),
  );

  const endOfPeriodRawBalanceByAccountId = new Map(
    baseData.endOfPeriodRawBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const {
    virtualGroups: transferClearingVirtualGroups,
    virtualAccounts: transferClearingVirtualAccounts,
    rawBalanceByVirtualAccountId,
  } = buildTransferClearingVirtualHierarchy({
    unitBuckets: baseData.transferClearingUnitBuckets,
  });

  const transferClearingUnitLabelByHoldingAccountId = new Map(
    baseData.transferClearingUnitBuckets
      .filter((bucket) => bucket.isNonReferenceUnit)
      .map((bucket) => [
        `virtual:transfer-clearing:account:${bucket.unitKey}`,
        bucket.unitLabel,
      ]),
  );
  const transferClearingHoldingAccounts = baseData.transferClearingUnitBuckets
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
    baseData.allAccountGroups.map((group) => [group.id, group]),
  );
  for (const virtualGroup of transferClearingVirtualGroups) {
    groupById.set(virtualGroup.id, virtualGroup);
  }

  const assetLiabilityAccounts = [
    ...baseData.baseAssetLiabilityAccounts,
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

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const equityAggregation = createPeriodOverviewEquityAggregation();
  const gainsLossesContributionByKey = new Map<
    string,
    GainLossContributionAccumulator
  >();

  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;

  if (!isBeforeAccountBookStart) {
    const equityBookingTotals = await processPeriodEquityBookingsFromBaseData({
      equityBookings: baseData.equityBookings,
      explicitCounterparts: baseData.explicitCounterparts,
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
      accountBookId: args.accountBookId,
      periodStart: queryStart,
      periodEndExclusive: queryEndExclusive,
      periodEnd: selection.to,
      initialHoldingDate,
      referenceCurrency,
      transactionPageSize: TRANSACTIONS_PAGE_SIZE,
      transferClearingBatchSize: TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE,
      holdingAccounts: baseData.holdingAccountsResolved,
      transferClearingHoldingAccounts,
      transferClearingUnitBuckets: baseData.transferClearingUnitBuckets,
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
      initialHoldingBalances: baseData.initialHoldingBalances,
      holdingTransactions: baseData.holdingTransactions,
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
    gainsLossesContributions: Array.from(gainsLossesContributionByKey.values()),
  });
}
