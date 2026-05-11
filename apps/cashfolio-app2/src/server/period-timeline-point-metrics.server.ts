import { round2 } from "./period-helpers";
import { moneyAdd, moneySum, toMoneyNumber } from "../shared/money";
import {
  computeEndOfPeriodBalanceStatsWithConvertedBalances,
  type EndOfPeriodBalanceStats,
} from "./period-balance-stats";
import {
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRateDetails,
} from "./period-conversion";
import {
  getOrLoadPeriodBaseData,
  type PeriodBaseData,
} from "./period-base-data-cache";
import { computePeriodHoldingGainLoss } from "./period-holding-gain-loss";
import { processPeriodEquityBookingsFromBaseData } from "./period-equity-bookings";
import { createPeriodOverviewEquityAggregation } from "./period-overview-aggregation";
import { buildTransferClearingVirtualHierarchy } from "./period-transfer-clearing";
import type { GainLossContributionAccumulator } from "./period-gains-losses-contributions";
import {
  buildBalanceTimelineScopeAmountMaps,
  buildTimelineScopeOptions,
  resolveScopedMetricValue,
  type TimelineMetricScopeFilter,
} from "./period-timeline-scopes.server";
import { type TimelineScopeOption } from "../shared/timeline-scope";
import type {
  ValuationRateLookupResult,
  ValuationRateSource,
} from "./valuation/types";
import type { Unit } from "../.prisma-client/enums";

const TRANSACTIONS_PAGE_SIZE = 200;
const TRANSFER_CLEARING_TRANSACTIONS_BATCH_SIZE = 200;

export type PeriodTimelinePointMetrics = {
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  scopeOptions: {
    income: TimelineScopeOption[];
    expenses: TimelineScopeOption[];
    assets: TimelineScopeOption[];
    liabilities: TimelineScopeOption[];
  };
  scopedMetricValue?: number;
};

type TimelineEndOfPeriodBalanceStats = EndOfPeriodBalanceStats & {
  convertedBalanceByAccountId: Map<string, number | null>;
};

export type TimelineValuationContext = {
  exchangeRateByKey: Map<string, Promise<ValuationRateLookupResult>>;
};

export type PeriodTimelinePointMetricsResult = {
  metrics: PeriodTimelinePointMetrics;
  cacheableFromPermanentValuationCache: boolean;
};

function isPermanentValuationSource(source: ValuationRateSource): boolean {
  return source === "identity" || source === "timeSeries";
}

function buildTransferClearingHoldingAccounts(args: {
  transferClearingUnitBuckets: PeriodBaseData["transferClearingUnitBuckets"];
}) {
  return args.transferClearingUnitBuckets
    .filter((bucket) => bucket.isNonReferenceUnit)
    .map((bucket) => ({
      id: `virtual:transfer-clearing:account:${bucket.unitKey}`,
      unit: bucket.unit,
      currency: bucket.currency,
      cryptocurrency: bucket.cryptocurrency,
      symbol: bucket.symbol,
      tradeCurrency: bucket.tradeCurrency,
    }));
}

async function loadEndOfPeriodBalanceStats(args: {
  baseData: PeriodBaseData;
  referenceCurrency: string;
  convertBalanceToReference: (input: {
    value: number;
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
    referenceCurrency: string;
  }) => Promise<number | null>;
}): Promise<TimelineEndOfPeriodBalanceStats> {
  const endOfPeriodRawBalanceByAccountId = new Map(
    args.baseData.endOfPeriodRawBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const { virtualAccounts, rawBalanceByVirtualAccountId } =
    buildTransferClearingVirtualHierarchy({
      unitBuckets: args.baseData.transferClearingUnitBuckets,
    });

  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
  }

  return computeEndOfPeriodBalanceStatsWithConvertedBalances({
    accounts: [...args.baseData.baseAssetLiabilityAccounts, ...virtualAccounts],
    rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
    periodEnd: args.baseData.selection.to,
    referenceCurrency: args.referenceCurrency,
    convertBalanceToReference: args.convertBalanceToReference,
  });
}

export async function loadPeriodTimelinePointMetrics(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
  metricScopeFilter?: TimelineMetricScopeFilter;
  valuationContext?: TimelineValuationContext;
}): Promise<PeriodTimelinePointMetrics> {
  const result = await loadPeriodTimelinePointMetricsWithCacheability(args);
  return result.metrics;
}

export async function loadPeriodTimelinePointMetricsWithCacheability(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
  metricScopeFilter?: TimelineMetricScopeFilter;
  valuationContext?: TimelineValuationContext;
}): Promise<PeriodTimelinePointMetricsResult> {
  const baseData =
    args.baseData ??
    (await getOrLoadPeriodBaseData({
      accountBookId: args.accountBookId,
      period: args.period,
    }));

  const selection = baseData.selection;
  if (selection.isBeforeAccountBookStart) {
    return {
      metrics: {
        totalReturn: 0,
        savings: 0,
        income: 0,
        expenses: 0,
        gainsLosses: 0,
        assets: 0,
        liabilities: 0,
        netWorth: 0,
        scopeOptions: {
          income: [],
          expenses: [],
          assets: [],
          liabilities: [],
        },
        scopedMetricValue: args.metricScopeFilter ? 0 : undefined,
      } satisfies PeriodTimelinePointMetrics,
      cacheableFromPermanentValuationCache: true,
    };
  }

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

  const transferClearingHoldingAccounts = buildTransferClearingHoldingAccounts({
    transferClearingUnitBuckets: baseData.transferClearingUnitBuckets,
  });

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

  const { virtualGroups, virtualAccounts } =
    buildTransferClearingVirtualHierarchy({
      unitBuckets: baseData.transferClearingUnitBuckets,
    });
  const assetLiabilityAccounts = [
    ...baseData.baseAssetLiabilityAccounts,
    ...virtualAccounts,
  ];
  const allAccountGroups = [...baseData.allAccountGroups, ...virtualGroups];

  const [holdingGainLossTotals, endOfPeriodBalanceStats] = await Promise.all([
    computePeriodHoldingGainLoss({
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
    }),
    loadEndOfPeriodBalanceStats({
      baseData,
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
  ]);

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
  const roundedAssets = round2(endOfPeriodBalanceStats.assets);
  const roundedLiabilities = round2(endOfPeriodBalanceStats.liabilities);
  const roundedNetWorth = round2(endOfPeriodBalanceStats.netWorth);
  const { assetAmountByAccountId, liabilityAmountByAccountId } =
    buildBalanceTimelineScopeAmountMaps({
      accounts: assetLiabilityAccounts,
      convertedBalanceByAccountId:
        endOfPeriodBalanceStats.convertedBalanceByAccountId,
    });
  const incomeScopeOptions = buildTimelineScopeOptions({
    amountByAccountId: equityAggregation.incomeAmountByAccountId,
    allAccountGroups,
  });
  const expenseScopeOptions = buildTimelineScopeOptions({
    amountByAccountId: equityAggregation.expenseAmountByAccountId,
    allAccountGroups,
  });
  const assetScopeOptions = buildTimelineScopeOptions({
    amountByAccountId: assetAmountByAccountId,
    allAccountGroups,
  });
  const liabilityScopeOptions = buildTimelineScopeOptions({
    amountByAccountId: liabilityAmountByAccountId,
    allAccountGroups,
  });
  const scopedMetricValue = resolveScopedMetricValue({
    metricScopeFilter: args.metricScopeFilter,
    amountByMetric: {
      income: equityAggregation.incomeAmountByAccountId,
      expenses: equityAggregation.expenseAmountByAccountId,
      assets: assetAmountByAccountId,
      liabilities: liabilityAmountByAccountId,
    },
    allAccountGroups,
  });

  return {
    metrics: {
      totalReturn: roundedTotalReturn,
      savings: roundedSavings,
      income: roundedIncome,
      expenses: roundedExpenses,
      gainsLosses: roundedGainsLosses,
      assets: roundedAssets,
      liabilities: roundedLiabilities,
      netWorth: roundedNetWorth,
      scopeOptions: {
        income: incomeScopeOptions,
        expenses: expenseScopeOptions,
        assets: assetScopeOptions,
        liabilities: liabilityScopeOptions,
      },
      scopedMetricValue,
    } satisfies PeriodTimelinePointMetrics,
    cacheableFromPermanentValuationCache,
  };
}
