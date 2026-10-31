import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "../period-balance-stats";
import {
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRateDetails,
} from "../period-conversion";
import type { PeriodBaseData } from "../cache/period-base-data-cache";
import { computePeriodHoldingGainLoss } from "../holdings/period-holding-gain-loss";
import { processPeriodEquityBookingsFromBaseData } from "../overview/period-equity-bookings";
import { createPeriodOverviewEquityAggregation } from "../overview/period-overview-aggregation";
import { preparePeriodCalculationContext } from "../period-calculation-context";
import type { GainLossContributionAccumulator } from "../breakdown/period-gains-losses-contributions";
import { computePeriodCashFlow } from "../overview/period-cash-flow";
import type { ValuationRateSource } from "../../valuation/types";
import type { HistoryValuationContext } from "./period-history-point-metrics-types";
import type { DecimalValuationRateLookupResult as ValuationRateLookupResult } from "../../valuation/types";

const TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE = 200;

function isPermanentValuationSource(source: ValuationRateSource): boolean {
  return source === "identity" || source === "timeSeries";
}

export async function loadHistoryPointValuations(args: {
  baseData: PeriodBaseData;
  valuationContext?: HistoryValuationContext;
}) {
  const { baseData } = args;
  const selection = baseData.selection;
  const referenceCurrency = baseData.referenceCurrency;
  const exchangeRateByKey =
    args.valuationContext?.exchangeRateByKey ??
    new Map<string, Promise<ValuationRateLookupResult>>();
  let cacheableFromPermanentValuationCache = true;
  const markValuationSource = (source: ValuationRateSource) => {
    if (!isPermanentValuationSource(source)) {
      cacheableFromPermanentValuationCache = false;
    }
  };
  const equityAggregation = createPeriodOverviewEquityAggregation();
  const gainsLossesContributionByKey = new Map<
    string,
    GainLossContributionAccumulator
  >();

  await processPeriodEquityBookingsFromBaseData({
    equityBookings: baseData.equityBookings,
    explicitCounterparts: baseData.explicitCounterparts,
    equityAggregation,
    gainsLossesContributionByKey,
    convertBookingToReference: async (booking) => {
      const result = await convertBookingValueToReferenceDetails({
        ...booking,
        referenceCurrency,
        exchangeRateByKey,
      });
      markValuationSource(result.source);
      return result.value;
    },
  });

  const calculationContext = preparePeriodCalculationContext(baseData);
  const {
    transferClearingHoldingAccounts,
    assetLiabilityAccountNameById,
    assetLiabilityAccounts,
    endOfPeriodRawBalanceByAccountId,
  } = calculationContext;

  const [holdingGainLossTotals, endOfPeriodBalanceStats, cashFlowResult] =
    await Promise.all([
      computePeriodHoldingGainLoss({
        periodStart: selection.from,
        periodEndExclusive: selection.queryEndExclusive,
        periodEnd: selection.to,
        initialHoldingDate: selection.initialHoldingDate,
        referenceCurrency,
        transferClearingBatchSize: TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE,
        holdingAccounts: baseData.holdingAccountsResolved,
        transferClearingHoldingAccounts,
        transferClearingUnitBuckets: baseData.transferClearingUnitBuckets,
        assetLiabilityAccountNameById,
        gainsLossesContributionByKey,
        resolveRate: async (input) => {
          const result = await getUnitToReferenceExchangeRateDetails({
            ...input,
            referenceCurrency,
            exchangeRateByKey,
          });
          markValuationSource(result.source);
          return result.rate;
        },
        convertBookingToReference: async (booking) => {
          const result = await convertBookingValueToReferenceDetails({
            ...booking,
            referenceCurrency,
            exchangeRateByKey,
          });
          markValuationSource(result.source);
          return result.value;
        },
        initialHoldingBalances: baseData.initialHoldingBalances,
        holdingTransactions: baseData.holdingTransactions,
        executionResidualTransactions: baseData.executionResidualTransactions,
      }),
      computeEndOfPeriodBalanceStatsWithConvertedBalances({
        accounts: assetLiabilityAccounts,
        rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
        periodEnd: selection.to,
        referenceCurrency,
        convertBalanceToReference: async (input) => {
          const result = await convertBookingValueToReferenceDetails({
            ...input,
            exchangeRateByKey,
          });
          markValuationSource(result.source);
          return result.value;
        },
      }),
      computePeriodCashFlow({
        transactions: baseData.cashFlowTransactions,
        periodStart: selection.from,
        periodEndExclusive: selection.queryEndExclusive,
        convertBookingToReference: async (booking) => {
          const result = await convertBookingValueToReferenceDetails({
            ...booking,
            referenceCurrency,
            exchangeRateByKey,
          });
          markValuationSource(result.source);
          return result.value;
        },
      }),
    ]);

  return {
    equityAggregation,
    gainsLossesContributionByKey,
    calculationContext,
    holdingGainLossTotals,
    endOfPeriodBalanceStats,
    cashFlowResult,
    cacheableFromPermanentValuationCache,
  };
}
export type HistoryPointValuations = Awaited<
  ReturnType<typeof loadHistoryPointValuations>
>;
