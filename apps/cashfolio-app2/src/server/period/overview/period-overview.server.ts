import { buildGainLossAccountAttribution } from "../breakdown/period-gain-loss-attribution";
import { toMoney, type Money, moneyAdd } from "../../../shared/money";
import { startOfUtcDay } from "../../../shared/date";

import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "../period-conversion";
import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "../period-balance-stats";
import {
  getOrLoadPeriodBaseData,
  type PeriodBaseData,
} from "../cache/period-base-data-cache";
import { computePeriodHoldingGainLoss } from "../holdings/period-holding-gain-loss";
import { createPeriodOverviewEquityAggregation } from "./period-overview-aggregation";
import { processPeriodEquityBookingsFromBaseData } from "./period-equity-bookings";
import { type GainLossContributionAccumulator } from "../breakdown/period-gains-losses-contributions";
import {
  preparePeriodCalculationContext,
  prepareGainLossStructure,
} from "../period-calculation-context";
import { buildPeriodOverviewResponse } from "./period-overview-response";
import { computePeriodCashFlow } from "./period-cash-flow";
import type { BreakdownHierarchyAccumulatorItem } from "../period-helpers";
import type { UserLocale } from "../../../user-locale";

const TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE = 200;

export async function loadPeriodOverview(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
  locale?: UserLocale;
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

  const {
    assetLiabilityAccountNameById,
    endOfPeriodRawBalanceByAccountId,
    transferClearingHoldingAccounts,
    groupById,
    assetLiabilityAccounts,
  } = preparePeriodCalculationContext(baseData);

  let bookingsCount = 0;
  let convertedBookingsCount = 0;
  let skippedBookingsCount = 0;

  const exchangeRateByKey = new Map<string, Promise<Money | null>>();
  const equityAggregation = createPeriodOverviewEquityAggregation();
  const gainsLossesContributionByKey = new Map<
    string,
    GainLossContributionAccumulator
  >();

  let realizedGainLoss: Money = toMoney(0);
  let unrealizedGainLoss: Money = toMoney(0);
  let cashFlow: Money = toMoney(0);
  let cashFlowAmountByAccountId = new Map<
    string,
    BreakdownHierarchyAccumulatorItem
  >();

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
      periodStart: queryStart,
      periodEndExclusive: queryEndExclusive,
      periodEnd: selection.to,
      initialHoldingDate,
      referenceCurrency,
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
      executionResidualTransactions: baseData.executionResidualTransactions,
    });

    realizedGainLoss = moneyAdd(
      realizedGainLoss,
      holdingGainLossTotals.realizedGainLoss,
    );
    unrealizedGainLoss = moneyAdd(
      unrealizedGainLoss,
      holdingGainLossTotals.unrealizedGainLoss,
    );
    convertedBookingsCount += holdingGainLossTotals.convertedCount;
    skippedBookingsCount += holdingGainLossTotals.skippedCount;

    const cashFlowResult = await computePeriodCashFlow({
      transactions: baseData.cashFlowTransactions,
      periodStart: queryStart,
      periodEndExclusive: queryEndExclusive,
      convertBookingToReference: (booking) =>
        convertBookingValueToReference({
          ...booking,
          referenceCurrency,
          exchangeRateByKey,
        }),
    });
    cashFlow = cashFlowResult.cashFlow;
    cashFlowAmountByAccountId = cashFlowResult.cashFlowAmountByAccountId;
    skippedBookingsCount += cashFlowResult.skippedCount;
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
    assetClasses: baseData.assetClasses,
    selection,
    minPeriodDate,
    currentDay,
    referenceCurrency,
    groupById,
    assetLiabilityAccounts,
    equityAggregation,
    realizedGainLoss,
    unrealizedGainLoss,
    cashFlow,
    cashFlowAmountByAccountId,
    hasCashAccounts: baseData.hasCashAccounts,
    isBeforeAccountBookStart,
    endOfPeriodBalanceStats,
    bookingsCount,
    convertedBookingsCount,
    skippedBookingsCount,
    gainLossAccountAttributionById: buildGainLossAccountAttribution(baseData, [
      ...gainsLossesContributionByKey.values(),
    ]),
    gainsLossesContributions: Array.from(gainsLossesContributionByKey.values()),
    gainLossStructure: prepareGainLossStructure(baseData),
    locale: args.locale,
  });
}
