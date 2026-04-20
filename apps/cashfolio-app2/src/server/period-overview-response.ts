import { AccountType } from "../.prisma-client/enums";
import { formatMonthPeriodValue } from "../shared/period";
import {
  buildAvailableYears,
  buildBreakdownHierarchyWithMeta,
  buildBreakdownItems,
  buildPeriodEndAllocationBreakdown,
  round2,
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

const TRANSFER_CLEARING_ACCOUNT_ID = "virtual:transfer-clearing";
const TRANSFER_CLEARING_ACCOUNT_NAME = "Transfer Clearing";

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
  transferClearingBalance: number;
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
  const transferClearingAssetAmount =
    args.transferClearingBalance > 0 ? args.transferClearingBalance : 0;
  const transferClearingLiabilityAmount =
    args.transferClearingBalance < 0 ? -args.transferClearingBalance : 0;
  const endOfPeriodAssetsWithTransferClearing =
    args.endOfPeriodBalanceStats.assets + transferClearingAssetAmount;
  const endOfPeriodLiabilitiesWithTransferClearing =
    args.endOfPeriodBalanceStats.liabilities + transferClearingLiabilityAmount;
  const endOfPeriodNetWorthWithTransferClearing =
    endOfPeriodAssetsWithTransferClearing -
    endOfPeriodLiabilitiesWithTransferClearing;

  const roundedEndOfPeriodAssets = round2(
    endOfPeriodAssetsWithTransferClearing,
  );
  const roundedEndOfPeriodLiabilities = round2(
    endOfPeriodLiabilitiesWithTransferClearing,
  );
  const roundedEndOfPeriodNetWorth = round2(
    endOfPeriodNetWorthWithTransferClearing,
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
  if (args.transferClearingBalance > 0) {
    convertedPeriodEndBalances.push({
      accountId: TRANSFER_CLEARING_ACCOUNT_ID,
      accountName: TRANSFER_CLEARING_ACCOUNT_NAME,
      groupId: null,
      accountType: AccountType.ASSET,
      convertedBalanceInReferenceCurrency: args.transferClearingBalance,
    });
  } else if (args.transferClearingBalance < 0) {
    convertedPeriodEndBalances.push({
      accountId: TRANSFER_CLEARING_ACCOUNT_ID,
      accountName: TRANSFER_CLEARING_ACCOUNT_NAME,
      groupId: null,
      accountType: AccountType.LIABILITY,
      convertedBalanceInReferenceCurrency: args.transferClearingBalance,
    });
  }
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
    assetBreakdown,
    liabilityBreakdown,
  };
}
