import { round2 } from "./period-helpers";
import { moneyAdd, moneySum, toMoneyNumber } from "../shared/money";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import {
  getOrLoadPeriodBaseData,
  type PeriodBaseData,
} from "./period-base-data-cache";
import { computePeriodHoldingGainLoss } from "./period-holding-gain-loss";
import { processPeriodEquityBookingsFromBaseData } from "./period-equity-bookings";
import { createPeriodOverviewEquityAggregation } from "./period-overview-aggregation";
import type { GainLossContributionAccumulator } from "./period-gains-losses-contributions";

const TRANSACTIONS_PAGE_SIZE = 200;
const TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE = 200;

export type PeriodTimelinePointMetrics = {
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
};

export async function loadPeriodTimelinePointMetrics(args: {
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

  const selection = baseData.selection;
  if (selection.isBeforeAccountBookStart) {
    return {
      totalReturn: 0,
      savings: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
    } satisfies PeriodTimelinePointMetrics;
  }

  const referenceCurrency = baseData.referenceCurrency;
  const exchangeRateByKey = new Map<string, Promise<number | null>>();
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
    convertBookingToReference: (booking) =>
      convertBookingValueToReference({
        ...booking,
        referenceCurrency,
        exchangeRateByKey,
      }),
  });

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

  const assetLiabilityAccountNameById = new Map(
    baseData.baseAssetLiabilityAccounts.map((account) => [
      account.id,
      account.name,
    ]),
  );
  for (const bucket of baseData.transferClearingUnitBuckets) {
    if (!bucket.isNonReferenceUnit) {
      continue;
    }
    assetLiabilityAccountNameById.set(
      `virtual:transfer-clearing:account:${bucket.unitKey}`,
      bucket.unitLabel,
    );
  }

  const holdingGainLossTotals = await computePeriodHoldingGainLoss({
    accountBookId: args.accountBookId,
    periodStart: selection.from,
    periodEndExclusive: selection.queryEndExclusive,
    periodEnd: selection.to,
    initialHoldingDate: selection.initialHoldingDate,
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

  const { income, expenses, explicitGainLoss } = equityAggregation;
  const gainsLosses = toMoneyNumber(
    moneySum([
      explicitGainLoss,
      holdingGainLossTotals.realizedGainLoss,
      holdingGainLossTotals.unrealizedGainLoss,
    ]),
  );

  const roundedIncome = round2(income);
  const roundedExpenses = round2(expenses);
  const roundedGainsLosses = round2(gainsLosses);
  const roundedSavings = round2(
    toMoneyNumber(moneyAdd(roundedIncome, -roundedExpenses)),
  );
  const roundedTotalReturn = round2(
    toMoneyNumber(moneyAdd(roundedSavings, roundedGainsLosses)),
  );

  return {
    totalReturn: roundedTotalReturn,
    savings: roundedSavings,
    income: roundedIncome,
    expenses: roundedExpenses,
    gainsLosses: roundedGainsLosses,
  } satisfies PeriodTimelinePointMetrics;
}
