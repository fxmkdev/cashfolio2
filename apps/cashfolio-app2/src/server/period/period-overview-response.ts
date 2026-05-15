import { AccountType } from "../../.prisma-client/enums";
import { formatMonthPeriodValue } from "../../shared/period";
import {
  buildAvailableYears,
  buildBreakdownHierarchyWithMeta,
  buildBreakdownItems,
  buildPeriodEndAllocationBreakdown,
  round2,
  type PeriodGroupNode,
} from "./period-helpers";
import { moneyAdd, moneySum, toMoneyNumber } from "../../shared/money";
import type { PeriodOverviewEquityAggregation } from "./period-overview-aggregation";
import {
  buildGainsLossesBreakdown,
  type PeriodGainsLossesContribution,
} from "./period-gains-losses-breakdown";
import type { NormalizedPeriodSelection } from "./period-selection";

type PeriodOverviewAssetLiabilityAccount = {
  id: string;
  name: string;
  groupId: string | null;
  type: AccountType;
};

type PeriodOverviewEndOfPeriodStats = {
  assets: number;
  liabilities: number;
  netWorth: number;
  convertedBalanceByAccountId: Map<string, number | null>;
};

export function buildPeriodOverviewResponse(args: {
  selection: NormalizedPeriodSelection;
  minPeriodDate: Date;
  currentDay: Date;
  referenceCurrency: string;
  groupById: Map<string, PeriodGroupNode>;
  assetLiabilityAccounts: PeriodOverviewAssetLiabilityAccount[];
  equityAggregation: PeriodOverviewEquityAggregation;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
  isBeforeAccountBookStart: boolean;
  endOfPeriodBalanceStats: PeriodOverviewEndOfPeriodStats;
  bookingsCount: number;
  convertedBookingsCount: number;
  skippedBookingsCount: number;
  gainsLossesContributions?: PeriodGainsLossesContribution[];
}) {
  const { income, expenses, explicitGainLoss } = args.equityAggregation;
  const realizedGainLoss = args.isBeforeAccountBookStart
    ? 0
    : args.realizedGainLoss;
  const unrealizedGainLoss = args.isBeforeAccountBookStart
    ? 0
    : args.unrealizedGainLoss;
  const gainsLosses = args.isBeforeAccountBookStart
    ? 0
    : toMoneyNumber(
        moneySum([explicitGainLoss, realizedGainLoss, unrealizedGainLoss]),
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
  const roundedEndOfPeriodAssets = round2(args.endOfPeriodBalanceStats.assets);
  const roundedEndOfPeriodLiabilities = round2(
    args.endOfPeriodBalanceStats.liabilities,
  );
  const roundedEndOfPeriodNetWorth = round2(
    args.endOfPeriodBalanceStats.netWorth,
  );

  const convertedPeriodEndBalances = args.assetLiabilityAccounts.map(
    (account) => ({
      accountId: account.id,
      accountName: account.name,
      groupId: account.groupId,
      accountType: account.type,
      convertedBalanceInReferenceCurrency:
        args.endOfPeriodBalanceStats.convertedBalanceByAccountId.get(
          account.id,
        ) ?? null,
    }),
  );
  const assetBreakdown = buildPeriodEndAllocationBreakdown({
    items: convertedPeriodEndBalances.filter(
      (
        item,
      ): item is (typeof convertedPeriodEndBalances)[number] & {
        accountType: "ASSET";
      } => item.accountType === AccountType.ASSET,
    ),
    groupById: args.groupById,
  });
  const liabilityBreakdown = buildPeriodEndAllocationBreakdown({
    items: convertedPeriodEndBalances.filter(
      (
        item,
      ): item is (typeof convertedPeriodEndBalances)[number] & {
        accountType: "LIABILITY";
      } => item.accountType === AccountType.LIABILITY,
    ),
    groupById: args.groupById,
  });

  const {
    hierarchy: expenseBreakdownHierarchy,
    hasHiddenAmountDiscrepancy: expenseBreakdownHasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds: expenseBreakdownDiscrepancyNodeIds,
  } = buildBreakdownHierarchyWithMeta({
    items: Array.from(args.equityAggregation.expenseAmountByAccountId.values()),
    groupById: args.groupById,
  });
  const {
    hierarchy: incomeBreakdownHierarchy,
    hasHiddenAmountDiscrepancy: incomeBreakdownHasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds: incomeBreakdownDiscrepancyNodeIds,
  } = buildBreakdownHierarchyWithMeta({
    items: Array.from(args.equityAggregation.incomeAmountByAccountId.values()),
    groupById: args.groupById,
  });
  const expenseBreakdown = buildBreakdownItems(
    expenseBreakdownHierarchy.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: node.amount,
    })),
  );
  const incomeBreakdown = buildBreakdownItems(
    incomeBreakdownHierarchy.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: node.amount,
    })),
  );

  const availableYears = buildAvailableYears({
    firstBookingDate: args.minPeriodDate,
    now: args.currentDay,
  });
  const gainsLossesBreakdown = buildGainsLossesBreakdown({
    contributions: args.gainsLossesContributions ?? [],
    referenceCurrency: args.referenceCurrency,
  });

  return {
    selectedPeriodValue: args.selection.periodValue,
    selectedPeriodSpecifier: args.selection.periodSpecifier,
    selectedPeriodLabel: args.selection.label,
    selectedGranularity: args.selection.granularity,
    selectedYear: args.selection.year,
    selectedMonth: args.selection.month,
    periodDateRange: {
      from: args.selection.from.toISOString(),
      to: args.selection.to.toISOString(),
    },
    minBookingDate: args.minPeriodDate.toISOString(),
    maxDate: args.currentDay.toISOString(),
    availableYears,
    currentMonthValue: formatMonthPeriodValue(
      args.currentDay.getUTCFullYear(),
      args.currentDay.getUTCMonth(),
    ),
    currentYearValue: String(args.currentDay.getUTCFullYear()),
    referenceCurrency: args.referenceCurrency,
    bookingsCount: args.bookingsCount,
    convertedBookingsCount: args.convertedBookingsCount,
    skippedBookingsCount: args.skippedBookingsCount,
    stats: {
      totalReturn: roundedTotalReturn,
      savings: roundedSavings,
      income: roundedIncome,
      expenses: roundedExpenses,
      gainsLosses: roundedGainsLosses,
      endOfPeriodNetWorth: roundedEndOfPeriodNetWorth,
      endOfPeriodAssets: roundedEndOfPeriodAssets,
      endOfPeriodLiabilities: roundedEndOfPeriodLiabilities,
      explicitGainLoss: round2(explicitGainLoss),
      realizedGainLoss: round2(realizedGainLoss),
      unrealizedGainLoss: round2(unrealizedGainLoss),
    },
    expenseBreakdown: {
      totalAmount: expenseBreakdown.totalAmount,
      items: expenseBreakdown.items,
      hierarchy: expenseBreakdownHierarchy,
      hasHiddenAmountDiscrepancy: expenseBreakdownHasHiddenAmountDiscrepancy,
      hiddenAmountDiscrepancyNodeIds: expenseBreakdownDiscrepancyNodeIds,
    },
    incomeBreakdown: {
      totalAmount: incomeBreakdown.totalAmount,
      items: incomeBreakdown.items,
      hierarchy: incomeBreakdownHierarchy,
      hasHiddenAmountDiscrepancy: incomeBreakdownHasHiddenAmountDiscrepancy,
      hiddenAmountDiscrepancyNodeIds: incomeBreakdownDiscrepancyNodeIds,
    },
    assetBreakdown,
    liabilityBreakdown,
    gainsLossesBreakdown,
  };
}
