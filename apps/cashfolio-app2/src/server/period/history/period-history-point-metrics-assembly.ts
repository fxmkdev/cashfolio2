import { buildGainLossAccountAttribution } from "../breakdown/period-gain-loss-attribution";
import { prepareGainLossStructure } from "../period-calculation-context";
import { toMoney, moneyAdd, moneySum } from "../../../shared/money";
import { round2 } from "../period-helpers";
import type { PeriodBaseData } from "../cache/period-base-data-cache";
import {
  buildNetWorthHistoryScopeAmountMap,
  buildHistoryGainLossScopeOptions,
  buildHistoryScopeOptions,
  buildNetWorthHistoryScopeOptions,
  resolveScopedMetricValue,
  type HistoryMetricScopeFilter,
} from "./period-history-scopes.server";
import { buildGainsLossesBreakdown } from "../breakdown/period-gains-losses-breakdown";
import type {
  PeriodHistoryPointMetrics,
  PeriodHistoryPointMetricsResult,
} from "./period-history-point-metrics-types";
import type { HistoryPointValuations } from "./period-history-point-metrics-valuation.server";

export function createEmptyHistoryPointMetrics(
  scoped: boolean,
): PeriodHistoryPointMetricsResult {
  return {
    metrics: {
      totalReturn: toMoney(0),
      savings: toMoney(0),
      cashFlow: toMoney(0),
      income: toMoney(0),
      expenses: toMoney(0),
      gainsLosses: toMoney(0),
      assets: toMoney(0),
      liabilities: toMoney(0),
      netWorth: toMoney(0),
      scopeOptions: {
        cashFlow: [],
        income: [],
        expenses: [],
        gainsLosses: [],
        netWorth: [],
      },
      scopedMetricValue: scoped ? toMoney(0) : undefined,
    } satisfies PeriodHistoryPointMetrics,
    cacheableFromPermanentValuationCache: true,
  };
}

export function assembleHistoryPointMetrics(args: {
  baseData: PeriodBaseData;
  valuations: HistoryPointValuations;
  metricScopeFilter?: HistoryMetricScopeFilter;
}): PeriodHistoryPointMetricsResult {
  const { baseData } = args;
  const referenceCurrency = baseData.referenceCurrency;
  const {
    equityAggregation,
    gainsLossesContributionByKey,
    holdingGainLossTotals,
    endOfPeriodBalanceStats,
    cashFlowResult,
    cacheableFromPermanentValuationCache,
  } = args.valuations;
  const { assetLiabilityAccounts, allAccountGroups } =
    args.valuations.calculationContext;
  const { income, expenses, explicitGainLoss } = equityAggregation;
  const gainsLosses = moneySum([
    explicitGainLoss,
    holdingGainLossTotals.realizedGainLoss,
    holdingGainLossTotals.unrealizedGainLoss,
  ]);

  const roundedIncome = round2(income);
  const roundedExpenses = round2(expenses);
  const roundedGainsLosses = round2(gainsLosses);
  const roundedCashFlow = round2(cashFlowResult.cashFlow);
  const roundedSavings = round2(
    moneyAdd(roundedIncome, toMoney(roundedExpenses).neg()),
  );
  const roundedTotalReturn = round2(
    moneyAdd(roundedSavings, roundedGainsLosses),
  );
  const roundedAssets = round2(endOfPeriodBalanceStats.assets);
  const roundedLiabilities = round2(endOfPeriodBalanceStats.liabilities);
  const roundedNetWorth = round2(endOfPeriodBalanceStats.netWorth);
  const netWorthAmountByAccountId = buildNetWorthHistoryScopeAmountMap({
    accounts: assetLiabilityAccounts,
    convertedBalanceByAccountId:
      endOfPeriodBalanceStats.convertedBalanceByAccountId,
  });
  const cashFlowScopeOptions = buildHistoryScopeOptions({
    amountByAccountId: cashFlowResult.cashFlowAmountByAccountId,
    allAccountGroups,
  });
  const incomeScopeOptions = buildHistoryScopeOptions({
    amountByAccountId: equityAggregation.incomeAmountByAccountId,
    allAccountGroups,
  });
  const expenseScopeOptions = buildHistoryScopeOptions({
    amountByAccountId: equityAggregation.expenseAmountByAccountId,
    allAccountGroups,
  });
  const netWorthScopeOptions = buildNetWorthHistoryScopeOptions({
    accounts: assetLiabilityAccounts.filter((account) =>
      account.id.startsWith("virtual:"),
    ),
    groups: allAccountGroups.filter((group) => group.id.startsWith("virtual:")),
  });
  const gainsLossesBreakdown = buildGainsLossesBreakdown({
    assetClasses: baseData.assetClasses,
    contributions: Array.from(gainsLossesContributionByKey.values()),
    accountAttributionById: buildGainLossAccountAttribution(baseData, [
      ...gainsLossesContributionByKey.values(),
    ]),
    referenceCurrency,
  });
  const accountStructureGainsLossesBreakdown = buildGainsLossesBreakdown({
    contributions: Array.from(gainsLossesContributionByKey.values()),
    accountAttributionById: buildGainLossAccountAttribution(baseData, [
      ...gainsLossesContributionByKey.values(),
    ]),
    referenceCurrency,
    grouping: "accountStructure",
    ...prepareGainLossStructure(baseData),
  });
  const gainLossScopeOptions = [
    ...buildHistoryGainLossScopeOptions({
      hierarchy: accountStructureGainsLossesBreakdown.hierarchy,
      grouping: "accountStructure",
    }),
    ...buildHistoryGainLossScopeOptions({
      hierarchy: gainsLossesBreakdown.hierarchy,
      grouping: "assetClass",
    }),
  ];
  const scopedMetricValue = resolveScopedMetricValue({
    metricScopeFilter: args.metricScopeFilter,
    amountByMetric: {
      income: equityAggregation.incomeAmountByAccountId,
      cashFlow: cashFlowResult.cashFlowAmountByAccountId,
      expenses: equityAggregation.expenseAmountByAccountId,
      netWorth: netWorthAmountByAccountId,
    },
    gainsLossesHierarchy: gainsLossesBreakdown.hierarchy,
    accountStructureGainsLossesHierarchy:
      accountStructureGainsLossesBreakdown.hierarchy,
    allAccountGroups,
  });

  return {
    metrics: {
      totalReturn: roundedTotalReturn,
      savings: roundedSavings,
      cashFlow: roundedCashFlow,
      income: roundedIncome,
      expenses: roundedExpenses,
      gainsLosses: roundedGainsLosses,
      assets: roundedAssets,
      liabilities: roundedLiabilities,
      netWorth: roundedNetWorth,
      scopeOptions: {
        cashFlow: cashFlowScopeOptions,
        income: incomeScopeOptions,
        expenses: expenseScopeOptions,
        gainsLosses: gainLossScopeOptions,
        netWorth: netWorthScopeOptions,
      },
      scopedMetricValue,
    } satisfies PeriodHistoryPointMetrics,
    cacheableFromPermanentValuationCache,
  };
}
