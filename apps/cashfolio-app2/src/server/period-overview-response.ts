import { AccountType, Unit } from "../.prisma-client/enums";
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

export type PeriodGainsLossesUnitContribution = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
};

export type PeriodGainsLossesBreakdownNode = {
  id: string;
  label: string;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
  totalGainLoss: number;
  children: PeriodGainsLossesBreakdownNode[];
};

type UnitTypeDescriptor = {
  id: "fx" | "security" | "cryptocurrency";
  label: "FX" | "Security" | "Cryptocurrency";
};

const UNIT_TYPE_DESCRIPTORS: UnitTypeDescriptor[] = [
  { id: "fx", label: "FX" },
  { id: "security", label: "Security" },
  { id: "cryptocurrency", label: "Cryptocurrency" },
];

function normalizeUppercaseCode(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.toUpperCase();
}

function getUnitTypeDescriptor(unit: Unit): UnitTypeDescriptor {
  if (unit === Unit.CURRENCY) {
    return UNIT_TYPE_DESCRIPTORS[0]!;
  }
  if (unit === Unit.SECURITY) {
    return UNIT_TYPE_DESCRIPTORS[1]!;
  }
  return UNIT_TYPE_DESCRIPTORS[2]!;
}

function getUnitContributionDescriptor(
  args: PeriodGainsLossesUnitContribution,
): {
  unitType: UnitTypeDescriptor;
  unitId: string;
  unitLabel: string;
} {
  if (args.unit === Unit.CURRENCY) {
    const currency = normalizeUppercaseCode(args.currency) ?? "UNKNOWN";
    return {
      unitType: getUnitTypeDescriptor(args.unit),
      unitId: `fx:${currency}`,
      unitLabel: currency,
    };
  }

  if (args.unit === Unit.CRYPTOCURRENCY) {
    const cryptocurrency =
      normalizeUppercaseCode(args.cryptocurrency) ?? "UNKNOWN";
    return {
      unitType: getUnitTypeDescriptor(args.unit),
      unitId: `crypto:${cryptocurrency}`,
      unitLabel: cryptocurrency,
    };
  }

  const symbol = normalizeUppercaseCode(args.symbol) ?? "UNKNOWN";
  const tradeCurrency = normalizeUppercaseCode(args.tradeCurrency) ?? "UNKNOWN";
  return {
    unitType: getUnitTypeDescriptor(args.unit),
    unitId: `security:${symbol}:${tradeCurrency}`,
    unitLabel: `${symbol} (${tradeCurrency})`,
  };
}

function buildGainsLossesBreakdown(
  contributions: PeriodGainsLossesUnitContribution[],
): {
  hierarchy: PeriodGainsLossesBreakdownNode[];
} {
  const byUnitId = new Map<
    string,
    {
      unitTypeId: UnitTypeDescriptor["id"];
      unitLabel: string;
      realizedGainLoss: number;
      unrealizedGainLoss: number;
    }
  >();

  for (const contribution of contributions) {
    if (
      contribution.realizedGainLoss === 0 &&
      contribution.unrealizedGainLoss === 0
    ) {
      continue;
    }

    const descriptor = getUnitContributionDescriptor(contribution);
    const existing = byUnitId.get(descriptor.unitId);

    if (existing) {
      existing.realizedGainLoss += contribution.realizedGainLoss;
      existing.unrealizedGainLoss += contribution.unrealizedGainLoss;
      continue;
    }

    byUnitId.set(descriptor.unitId, {
      unitTypeId: descriptor.unitType.id,
      unitLabel: descriptor.unitLabel,
      realizedGainLoss: contribution.realizedGainLoss,
      unrealizedGainLoss: contribution.unrealizedGainLoss,
    });
  }

  const hierarchy: PeriodGainsLossesBreakdownNode[] = [];

  for (const unitType of UNIT_TYPE_DESCRIPTORS) {
    const childNodes = Array.from(byUnitId.entries())
      .filter(([, unitValue]) => unitValue.unitTypeId === unitType.id)
      .sort((left, right) =>
        left[1].unitLabel.localeCompare(right[1].unitLabel, "en"),
      )
      .map(([unitId, unitValue]) => ({
        id: `unit:${unitId}`,
        label: unitValue.unitLabel,
        realizedGainLoss: unitValue.realizedGainLoss,
        unrealizedGainLoss: unitValue.unrealizedGainLoss,
        totalGainLoss:
          unitValue.realizedGainLoss + unitValue.unrealizedGainLoss,
        children: [],
      }));

    if (childNodes.length === 0) {
      continue;
    }

    const realizedGainLoss = childNodes.reduce(
      (sum, node) => sum + node.realizedGainLoss,
      0,
    );
    const unrealizedGainLoss = childNodes.reduce(
      (sum, node) => sum + node.unrealizedGainLoss,
      0,
    );

    hierarchy.push({
      id: `unit-type:${unitType.id}`,
      label: unitType.label,
      realizedGainLoss,
      unrealizedGainLoss,
      totalGainLoss: realizedGainLoss + unrealizedGainLoss,
      children: childNodes,
    });
  }

  return { hierarchy };
}

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
  gainsLossesUnitContributions?: PeriodGainsLossesUnitContribution[];
}) {
  const { income, expenses, explicitGainLoss } = args.equityAggregation;
  const realizedGainLoss = args.isBeforeAccountBookStart
    ? 0
    : explicitGainLoss + args.realizedGainLoss;
  const unrealizedGainLoss = args.isBeforeAccountBookStart
    ? 0
    : args.unrealizedGainLoss;
  const gainsLosses = realizedGainLoss + unrealizedGainLoss;

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
  const gainsLossesBreakdown = buildGainsLossesBreakdown(
    args.gainsLossesUnitContributions ?? [],
  );

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
