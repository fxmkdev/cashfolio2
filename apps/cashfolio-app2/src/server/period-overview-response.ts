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
import { moneyAdd, moneySum, toMoneyNumber } from "../shared/money";
import type { PeriodOverviewEquityAggregation } from "./period-overview-aggregation";
import { normalizeUppercaseCode } from "./period-unit-format";
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

export type PeriodGainsLossesContribution = {
  sourceKind: "HOLDING" | "EXPLICIT";
  accountId: string;
  accountName: string;
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
  id: "fx" | "security" | "cryptocurrency" | "explicit";
  label: "FX" | "Security" | "Cryptocurrency" | "Explicit G/L";
};

const UNIT_TYPE_DESCRIPTORS: UnitTypeDescriptor[] = [
  { id: "fx", label: "FX" },
  { id: "security", label: "Security" },
  { id: "cryptocurrency", label: "Cryptocurrency" },
  { id: "explicit", label: "Explicit G/L" },
];

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
  args: PeriodGainsLossesContribution & { referenceCurrency: string },
): {
  unitType: UnitTypeDescriptor;
  unitId: string;
  unitLabel: string;
} | null {
  if (args.unit === Unit.CURRENCY) {
    const currency = normalizeUppercaseCode(args.currency) ?? "UNKNOWN";
    const referenceCurrency =
      normalizeUppercaseCode(args.referenceCurrency) ?? "UNKNOWN";
    if (currency === referenceCurrency) {
      return null;
    }
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

function toRoundedGainLossTotals(args: {
  realizedGainLoss: number;
  unrealizedGainLoss: number;
}) {
  const realizedGainLoss = round2(args.realizedGainLoss);
  const unrealizedGainLoss = round2(args.unrealizedGainLoss);
  return {
    realizedGainLoss,
    unrealizedGainLoss,
    totalGainLoss: round2(
      toMoneyNumber(moneyAdd(realizedGainLoss, unrealizedGainLoss)),
    ),
  };
}

function buildGainsLossesBreakdown(args: {
  contributions: PeriodGainsLossesContribution[];
  referenceCurrency: string;
}): {
  hierarchy: PeriodGainsLossesBreakdownNode[];
} {
  type UnitContributionBucket = {
    unitTypeId: UnitTypeDescriptor["id"];
    unitLabel: string;
    byAccountId: Map<
      string,
      {
        accountName: string;
        realizedGainLoss: number;
        unrealizedGainLoss: number;
      }
    >;
  };

  const byUnitId = new Map<string, UnitContributionBucket>();
  const explicitByAccountId = new Map<
    string,
    {
      accountName: string;
      realizedGainLoss: number;
      unrealizedGainLoss: number;
    }
  >();

  for (const contribution of args.contributions) {
    if (
      contribution.realizedGainLoss === 0 &&
      contribution.unrealizedGainLoss === 0
    ) {
      continue;
    }

    if (contribution.sourceKind === "EXPLICIT") {
      const explicitExisting = explicitByAccountId.get(contribution.accountId);
      if (explicitExisting) {
        explicitExisting.realizedGainLoss = toMoneyNumber(
          moneyAdd(
            explicitExisting.realizedGainLoss,
            contribution.realizedGainLoss,
          ),
        );
        explicitExisting.unrealizedGainLoss = toMoneyNumber(
          moneyAdd(
            explicitExisting.unrealizedGainLoss,
            contribution.unrealizedGainLoss,
          ),
        );
      } else {
        explicitByAccountId.set(contribution.accountId, {
          accountName: contribution.accountName,
          realizedGainLoss: contribution.realizedGainLoss,
          unrealizedGainLoss: contribution.unrealizedGainLoss,
        });
      }
      continue;
    }

    const descriptor = getUnitContributionDescriptor({
      ...contribution,
      referenceCurrency: args.referenceCurrency,
    });
    if (!descriptor) {
      continue;
    }
    const existingUnit = byUnitId.get(descriptor.unitId);
    const unitValue =
      existingUnit ??
      ({
        unitTypeId: descriptor.unitType.id,
        unitLabel: descriptor.unitLabel,
        byAccountId: new Map(),
      } satisfies UnitContributionBucket);
    if (!existingUnit) {
      byUnitId.set(descriptor.unitId, unitValue);
    }

    const existingAccount = unitValue.byAccountId.get(contribution.accountId);
    if (existingAccount) {
      existingAccount.realizedGainLoss = toMoneyNumber(
        moneyAdd(
          existingAccount.realizedGainLoss,
          contribution.realizedGainLoss,
        ),
      );
      existingAccount.unrealizedGainLoss = toMoneyNumber(
        moneyAdd(
          existingAccount.unrealizedGainLoss,
          contribution.unrealizedGainLoss,
        ),
      );
    } else {
      unitValue.byAccountId.set(contribution.accountId, {
        accountName: contribution.accountName,
        realizedGainLoss: contribution.realizedGainLoss,
        unrealizedGainLoss: contribution.unrealizedGainLoss,
      });
    }
  }

  const hierarchy: PeriodGainsLossesBreakdownNode[] = [];

  for (const unitType of UNIT_TYPE_DESCRIPTORS) {
    if (unitType.id === "explicit") {
      continue;
    }

    const childNodes = Array.from(byUnitId.entries())
      .filter(([, unitValue]) => unitValue.unitTypeId === unitType.id)
      .sort((left, right) =>
        left[1].unitLabel.localeCompare(right[1].unitLabel, "en"),
      )
      .map(([unitId, unitValue]) => ({
        id: `unit:${unitId}`,
        label: unitValue.unitLabel,
        ...(() => {
          const accountNodes = Array.from(unitValue.byAccountId.entries())
            .sort((left, right) =>
              left[1].accountName.localeCompare(right[1].accountName, "en"),
            )
            .map(([accountId, accountValue]) => ({
              id: `unit-account:${unitId}:${accountId}`,
              label: accountValue.accountName,
              ...toRoundedGainLossTotals({
                realizedGainLoss: accountValue.realizedGainLoss,
                unrealizedGainLoss: accountValue.unrealizedGainLoss,
              }),
              children: [],
            }));
          const roundedTotals = toRoundedGainLossTotals({
            realizedGainLoss: toMoneyNumber(
              moneySum(accountNodes.map((node) => node.realizedGainLoss)),
            ),
            unrealizedGainLoss: toMoneyNumber(
              moneySum(accountNodes.map((node) => node.unrealizedGainLoss)),
            ),
          });
          return {
            ...roundedTotals,
            children: accountNodes,
          };
        })(),
      }));

    if (childNodes.length === 0) {
      continue;
    }

    const roundedTotals = toRoundedGainLossTotals({
      realizedGainLoss: toMoneyNumber(
        moneySum(childNodes.map((node) => node.realizedGainLoss)),
      ),
      unrealizedGainLoss: toMoneyNumber(
        moneySum(childNodes.map((node) => node.unrealizedGainLoss)),
      ),
    });

    hierarchy.push({
      id: `unit-type:${unitType.id}`,
      label: unitType.label,
      ...roundedTotals,
      children: childNodes,
    });
  }

  const explicitChildren = Array.from(explicitByAccountId.entries())
    .sort((left, right) =>
      left[1].accountName.localeCompare(right[1].accountName, "en"),
    )
    .map(([accountId, accountValue]) => ({
      id: `explicit-account:${accountId}`,
      label: accountValue.accountName,
      ...toRoundedGainLossTotals({
        realizedGainLoss: accountValue.realizedGainLoss,
        unrealizedGainLoss: accountValue.unrealizedGainLoss,
      }),
      children: [],
    }));

  if (explicitChildren.length > 0) {
    const roundedTotals = toRoundedGainLossTotals({
      realizedGainLoss: toMoneyNumber(
        moneySum(explicitChildren.map((node) => node.realizedGainLoss)),
      ),
      unrealizedGainLoss: toMoneyNumber(
        moneySum(explicitChildren.map((node) => node.unrealizedGainLoss)),
      ),
    });
    hierarchy.push({
      id: "unit-type:explicit",
      label: "Explicit G/L",
      ...roundedTotals,
      children: explicitChildren,
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
