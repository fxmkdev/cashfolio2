import { AccountType } from "../.prisma-client/enums";
import { formatMonthPeriodValue } from "../shared/period";
import {
  buildAvailableYears,
  buildBreakdownHierarchyWithMeta,
  buildBreakdownItems,
  buildGainsLossesUnitBreakdownHierarchy,
  buildPeriodEndAllocationBreakdown,
  createGainsLossesUnitBreakdownAccumulator,
  round2,
  type GainsLossesUnitBreakdownAccumulator,
  type PeriodGroupNode,
} from "./period-helpers";
import type { PeriodOverviewEquityAggregation } from "./period-overview-aggregation";
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
  transactionGainLoss: number;
  holdingGainLoss: number;
  isBeforeAccountBookStart: boolean;
  endOfPeriodBalanceStats: PeriodOverviewEndOfPeriodStats;
  bookingsCount: number;
  convertedBookingsCount: number;
  skippedBookingsCount: number;
  gainsLossesUnitBreakdownAccumulator?: GainsLossesUnitBreakdownAccumulator;
}) {
  const { income, expenses, explicitGainLoss } = args.equityAggregation;
  const gainsLosses = args.isBeforeAccountBookStart
    ? 0
    : explicitGainLoss + args.transactionGainLoss + args.holdingGainLoss;

  const roundedIncome = round2(income);
  const roundedExpenses = round2(expenses);
  const roundedGainsLosses = round2(gainsLosses);
  const roundedSavings = round2(roundedIncome - roundedExpenses);
  const roundedTotalReturn = round2(roundedSavings + roundedGainsLosses);
  const roundedEndOfPeriodAssets = round2(args.endOfPeriodBalanceStats.assets);
  const roundedEndOfPeriodLiabilities = round2(
    args.endOfPeriodBalanceStats.liabilities,
  );
  const roundedEndOfPeriodNetWorth = round2(
    args.endOfPeriodBalanceStats.netWorth,
  );
  const gainsLossesBreakdown = buildGainsLossesUnitBreakdownHierarchy({
    accumulator:
      args.gainsLossesUnitBreakdownAccumulator ??
      createGainsLossesUnitBreakdownAccumulator(),
  });

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
      transactionGainLoss: round2(args.transactionGainLoss),
      holdingGainLoss: round2(args.holdingGainLoss),
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
    gainsLossesBreakdown: {
      totalAmount: roundedGainsLosses,
      hierarchy: gainsLossesBreakdown.hierarchy,
    },
    assetBreakdown,
    liabilityBreakdown,
  };
}
