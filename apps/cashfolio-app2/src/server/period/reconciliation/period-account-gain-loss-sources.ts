import type { PeriodBaseData } from "../base-data/period-base-data-types";
import { buildGainLossAccountAttribution } from "../breakdown/period-gain-loss-attribution";
import { buildGainsLossesBreakdown } from "../breakdown/period-gains-losses-breakdown";
import type { GainLossContributionAccumulator } from "../breakdown/period-gains-losses-contributions";
import { computePeriodHoldingGainLoss } from "../holdings/period-holding-gain-loss";
import { processPeriodEquityBookingsFromBaseData } from "../overview/period-equity-bookings";
import { createPeriodOverviewEquityAggregation } from "../overview/period-overview-aggregation";
import { preparePeriodCalculationContext } from "../period-calculation-context";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "../period-conversion";
import type { Money } from "../../../shared/money";

export type AccountGainLossSourceRow<Amount = number> = {
  id: string;
  date: string;
  transactionId: string;
  description: string | null;
  amount: Amount;
};

/** Replay the same contribution pipeline as overview/history, with explanation callbacks. */
export async function loadAccountGainLossSources(
  baseData: PeriodBaseData,
  accountId: string,
) {
  const context = preparePeriodCalculationContext(baseData);
  const gainsLossesContributionByKey = new Map<
    string,
    GainLossContributionAccumulator
  >();
  const recordedAdjustments: AccountGainLossSourceRow<Money>[] = [];
  const executionResiduals: AccountGainLossSourceRow<Money>[] = [];
  const exchangeRateByKey = new Map<string, Promise<Money | null>>();
  const conversion = {
    referenceCurrency: baseData.referenceCurrency,
    exchangeRateByKey,
  };
  if (!baseData.selection.isBeforeAccountBookStart) {
    await processPeriodEquityBookingsFromBaseData({
      equityBookings: baseData.equityBookings,
      explicitCounterparts: baseData.explicitCounterparts,
      equityAggregation: createPeriodOverviewEquityAggregation(),
      gainsLossesContributionByKey,
      convertBookingToReference: (booking) =>
        convertBookingValueToReference({ ...booking, ...conversion }),
      onRecordedAdjustment: (booking, amount, counterpartId) => {
        if (counterpartId === accountId)
          recordedAdjustments.push({
            id: booking.id,
            date: booking.date.toISOString(),
            transactionId: booking.transactionId,
            description:
              booking.description ?? booking.transactionDescription ?? null,
            amount,
          });
      },
    });
    await computePeriodHoldingGainLoss({
      periodStart: baseData.selection.from,
      periodEndExclusive: baseData.selection.queryEndExclusive,
      periodEnd: baseData.selection.to,
      initialHoldingDate: baseData.selection.initialHoldingDate,
      referenceCurrency: baseData.referenceCurrency,
      transferClearingBatchSize: 200,
      holdingAccounts: baseData.holdingAccountsResolved,
      transferClearingHoldingAccounts: context.transferClearingHoldingAccounts,
      transferClearingUnitBuckets: baseData.transferClearingUnitBuckets,
      assetLiabilityAccountNameById: context.assetLiabilityAccountNameById,
      gainsLossesContributionByKey,
      initialHoldingBalances: baseData.initialHoldingBalances,
      holdingTransactions: baseData.holdingTransactions,
      executionResidualTransactions: baseData.executionResidualTransactions,
      resolveRate: (input) =>
        getUnitToReferenceExchangeRate({ ...input, ...conversion }),
      convertBookingToReference: (booking) =>
        convertBookingValueToReference({ ...booking, ...conversion }),
      onExecutionResidual: (contribution) => {
        if (contribution.accountId === accountId)
          executionResiduals.push({
            id: contribution.bookingId,
            date: contribution.date.toISOString(),
            transactionId: contribution.transactionId,
            description:
              "Execution residual allocated by absolute converted amount.",
            amount: contribution.realizedGainLoss,
          });
      },
    });
  }
  const contributions = [...gainsLossesContributionByKey.values()];
  const hierarchy = buildGainsLossesBreakdown({
    contributions,
    referenceCurrency: baseData.referenceCurrency,
    accountAttributionById: buildGainLossAccountAttribution(baseData),
  }).hierarchy;
  return {
    node: hierarchy
      .flatMap((node) => node.children)
      .find((node) => node.account?.id === accountId),
    contribution: contributions.find(
      (contribution) => contribution.accountId === accountId,
    ),
    recordedAdjustments: recordedAdjustments.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    ),
    executionResiduals,
  };
}
