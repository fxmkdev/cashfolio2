import { round2 } from "./period-helpers";
import { moneyAdd, moneySum, toMoneyNumber } from "../shared/money";
import {
  computeEndOfPeriodBalanceStats,
  type EndOfPeriodBalanceStats,
} from "./period-balance-stats";
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
import { buildTransferClearingVirtualHierarchy } from "./period-transfer-clearing";
import type { GainLossContributionAccumulator } from "./period-gains-losses-contributions";
import { createGroupPathResolver } from "./accounts-helpers";
import {
  parseTimelineScopeSelection,
  type TimelineScopeOption,
  type TimelineScopeSelection,
  type TimelineScopedMetric,
} from "../shared/timeline-scope";

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
  };
  scopedMetricValue?: number;
};

type TimelineMetricScopeFilter = {
  metric: TimelineScopedMetric;
  scope: TimelineScopeSelection;
};

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
  exchangeRateByKey: Map<string, Promise<number | null>>;
}): Promise<EndOfPeriodBalanceStats> {
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

  return computeEndOfPeriodBalanceStats({
    accounts: [...args.baseData.baseAssetLiabilityAccounts, ...virtualAccounts],
    rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
    periodEnd: args.baseData.selection.to,
    referenceCurrency: args.referenceCurrency,
    convertBalanceToReference: (input) =>
      convertBookingValueToReference({
        ...input,
        exchangeRateByKey: args.exchangeRateByKey,
      }),
  });
}

export async function loadPeriodTimelinePointMetrics(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
  metricScopeFilter?: TimelineMetricScopeFilter;
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
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      scopeOptions: {
        income: [],
        expenses: [],
      },
      scopedMetricValue: 0,
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
    }),
    loadEndOfPeriodBalanceStats({
      baseData,
      referenceCurrency,
      exchangeRateByKey,
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
  const incomeScopeOptions = buildTimelineScopeOptions({
    amountByAccountId: equityAggregation.incomeAmountByAccountId,
    allAccountGroups: baseData.allAccountGroups,
  });
  const expenseScopeOptions = buildTimelineScopeOptions({
    amountByAccountId: equityAggregation.expenseAmountByAccountId,
    allAccountGroups: baseData.allAccountGroups,
  });
  const scopedMetricValue = resolveScopedMetricValue({
    metricScopeFilter: args.metricScopeFilter,
    incomeAmountByAccountId: equityAggregation.incomeAmountByAccountId,
    expenseAmountByAccountId: equityAggregation.expenseAmountByAccountId,
    allAccountGroups: baseData.allAccountGroups,
  });

  return {
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
    },
    scopedMetricValue,
  } satisfies PeriodTimelinePointMetrics;
}

function hasGroupInPath(args: {
  accountGroupId: string | null;
  targetGroupId: string;
  groupById: Map<string, { parentGroupId: string | null }>;
}): boolean {
  let groupId = args.accountGroupId;
  while (groupId) {
    if (groupId === args.targetGroupId) {
      return true;
    }
    groupId = args.groupById.get(groupId)?.parentGroupId ?? null;
  }

  return false;
}

function resolveScopedAmountFromMap(args: {
  amountByAccountId: Map<
    string,
    {
      accountId: string;
      accountName: string;
      groupId: string | null;
      amount: number;
    }
  >;
  scope: TimelineScopeSelection;
  groupById: Map<string, { parentGroupId: string | null }>;
}): number {
  if (args.scope === "total") {
    return round2(
      toMoneyNumber(
        moneySum(
          Array.from(args.amountByAccountId.values(), (item) => item.amount),
        ),
      ),
    );
  }

  if (args.scope.startsWith("account:")) {
    const accountId = args.scope.slice("account:".length);
    return round2(args.amountByAccountId.get(accountId)?.amount ?? 0);
  }

  const groupId = args.scope.slice("group:".length);
  let amount = 0;
  for (const item of args.amountByAccountId.values()) {
    if (
      hasGroupInPath({
        accountGroupId: item.groupId,
        targetGroupId: groupId,
        groupById: args.groupById,
      })
    ) {
      amount = toMoneyNumber(moneyAdd(amount, item.amount));
    }
  }

  return round2(amount);
}

function resolveScopedMetricValue(args: {
  metricScopeFilter?: TimelineMetricScopeFilter;
  incomeAmountByAccountId: Map<
    string,
    {
      accountId: string;
      accountName: string;
      groupId: string | null;
      amount: number;
    }
  >;
  expenseAmountByAccountId: Map<
    string,
    {
      accountId: string;
      accountName: string;
      groupId: string | null;
      amount: number;
    }
  >;
  allAccountGroups: Array<{
    id: string;
    name: string;
    parentGroupId: string | null;
  }>;
}): number | undefined {
  if (!args.metricScopeFilter) {
    return undefined;
  }

  const parsedScope = parseTimelineScopeSelection(args.metricScopeFilter.scope);
  if (!parsedScope) {
    return undefined;
  }

  const groupById = new Map(
    args.allAccountGroups.map((group) => [
      group.id,
      { parentGroupId: group.parentGroupId },
    ]),
  );
  if (args.metricScopeFilter.metric === "income") {
    return resolveScopedAmountFromMap({
      amountByAccountId: args.incomeAmountByAccountId,
      scope: parsedScope,
      groupById,
    });
  }

  return resolveScopedAmountFromMap({
    amountByAccountId: args.expenseAmountByAccountId,
    scope: parsedScope,
    groupById,
  });
}

function buildTimelineScopeOptions(args: {
  amountByAccountId: Map<
    string,
    {
      accountId: string;
      accountName: string;
      groupId: string | null;
      amount: number;
    }
  >;
  allAccountGroups: Array<{
    id: string;
    name: string;
    parentGroupId: string | null;
  }>;
}): TimelineScopeOption[] {
  const nonZeroItems = Array.from(args.amountByAccountId.values()).filter(
    (item) => item.amount !== 0,
  );
  if (nonZeroItems.length === 0) {
    return [];
  }

  const resolveGroupPath = createGroupPathResolver(args.allAccountGroups);
  const groupById = new Map(
    args.allAccountGroups.map((group) => [
      group.id,
      {
        parentGroupId: group.parentGroupId,
      },
    ]),
  );
  const accountOptionByValue = new Map<
    TimelineScopeSelection,
    TimelineScopeOption
  >();
  const groupOptionByValue = new Map<
    TimelineScopeSelection,
    TimelineScopeOption
  >();

  for (const item of nonZeroItems) {
    const accountValue = `account:${item.accountId}` as const;
    const accountLabel = item.groupId
      ? `${resolveGroupPath(item.groupId)} / ${item.accountName}`
      : item.accountName;
    accountOptionByValue.set(accountValue, {
      value: accountValue,
      label: `${accountLabel} (Account)`,
      kind: "account",
    });

    if (!item.groupId) {
      continue;
    }

    let groupId: string | null = item.groupId;
    while (groupId) {
      const groupValue = `group:${groupId}` as const;
      groupOptionByValue.set(groupValue, {
        value: groupValue,
        label: `${resolveGroupPath(groupId)} (Group)`,
        kind: "group",
      });
      groupId = groupById.get(groupId)?.parentGroupId ?? null;
    }
  }

  return [
    ...groupOptionByValue.values(),
    ...accountOptionByValue.values(),
  ].toSorted(
    (left, right) =>
      left.label.localeCompare(right.label, "en") ||
      left.value.localeCompare(right.value, "en"),
  );
}
