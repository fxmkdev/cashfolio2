import { useCallback, useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import type { getPeriodOverview } from "@/server/period";
import {
  getBreakdownDrillState,
  isBreakdownNodeDrillable,
} from "./-breakdown-drill";
import {
  type PeriodBreakdownChartDatum,
  type PeriodBreakdownNodeDatum,
  usePeriodBreakdownChartOptions,
} from "./-breakdown-chart-options";
import type {
  AllocationBreakdownType,
  BreakdownChartType,
} from "./-breakdown-types";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

type DrillPathByAllocationBreakdown = Record<AllocationBreakdownType, string[]>;

type AllocationPartialDataNotesArgs = {
  skippedMissingReferenceBalanceCount: number;
  skippedNegativeCount: number;
};

function formatAccountCountWithVerb(count: number): string {
  const accountLabel = count === 1 ? "account" : "accounts";
  const verb = count === 1 ? "was" : "were";

  return `${count} ${accountLabel} ${verb}`;
}

function formatAccountCount(count: number): string {
  const accountLabel = count === 1 ? "account" : "accounts";

  return `${count} ${accountLabel}`;
}

function getAllocationPartialDataNotes(args: AllocationPartialDataNotesArgs) {
  return [
    args.skippedMissingReferenceBalanceCount > 0
      ? `${formatAccountCountWithVerb(args.skippedMissingReferenceBalanceCount)} skipped because reference-currency balances were unavailable.`
      : null,
    args.skippedNegativeCount > 0
      ? `${formatAccountCount(args.skippedNegativeCount)} with negative balances ${args.skippedNegativeCount === 1 ? "was" : "were"} excluded from allocation.`
      : null,
  ]
    .filter((value): value is string => value != null)
    .join(" ");
}

export type PeriodAllocationBreakdownViewModel = {
  activeAllocationBreakdown: PeriodOverview["assetBreakdown"];
  allocationBreakdownTitle: string;
  allocationTableExpandedGroupsStorageKey: string;
  allocationBreakdownSubtitle: string;
  allocationDrillState: ReturnType<typeof getBreakdownDrillState>;
  hasAllocationBreakdownAmountDiscrepancy: boolean;
  hasAllocationBreakdown: boolean;
  emptyAllocationBreakdownMessage: string;
  allocationChartOptions: ReturnType<typeof usePeriodBreakdownChartOptions>;
  updateSelectedAllocationBreakdownPath: (nextPath: string[]) => void;
  hasAllocationPartialData: boolean;
  allocationPartialDataNotes: string;
};

export function usePeriodAllocationBreakdownViewModel(args: {
  accountBookId: string;
  overview: PeriodOverview;
  selectedAllocationBreakdown: AllocationBreakdownType;
  selectedAllocationChartType: BreakdownChartType;
  drillPathByAllocationBreakdown: DrillPathByAllocationBreakdown;
  setDrillPathByAllocationBreakdown: (
    nextValue: DrillPathByAllocationBreakdown,
  ) => void;
  currencyFormatter: Intl.NumberFormat;
  percentageFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
}): PeriodAllocationBreakdownViewModel {
  const {
    accountBookId,
    overview,
    selectedAllocationBreakdown,
    selectedAllocationChartType,
    drillPathByAllocationBreakdown,
    setDrillPathByAllocationBreakdown,
    currencyFormatter,
    percentageFormatter,
    colors,
  } = args;

  const activeAllocationBreakdown = useMemo(
    () =>
      selectedAllocationBreakdown === "asset"
        ? overview.assetBreakdown
        : overview.liabilityBreakdown,
    [
      overview.assetBreakdown,
      overview.liabilityBreakdown,
      selectedAllocationBreakdown,
    ],
  );

  const allocationBreakdownTitle =
    selectedAllocationBreakdown === "asset"
      ? "Assets Allocation"
      : "Liabilities Allocation";
  const allocationTableExpandedGroupsStorageKey = `cashfolio:periodExpandedGroups:${accountBookId}:allocation:${selectedAllocationBreakdown}`;
  const allocationBreakdownRootLabel =
    selectedAllocationBreakdown === "asset" ? "All Assets" : "All Liabilities";

  const allocationDrillState = useMemo(
    () =>
      getBreakdownDrillState({
        hierarchy: activeAllocationBreakdown.hierarchy,
        path: drillPathByAllocationBreakdown[selectedAllocationBreakdown],
        rootLabel: allocationBreakdownRootLabel,
      }),
    [
      activeAllocationBreakdown.hierarchy,
      allocationBreakdownRootLabel,
      drillPathByAllocationBreakdown,
      selectedAllocationBreakdown,
    ],
  );

  const allocationBreakdownSubtitle = useMemo(() => {
    const isTopLevel = allocationDrillState.clampedPath.length === 0;
    const groupLevelLabel =
      selectedAllocationBreakdown === "asset"
        ? "asset groups"
        : "liability groups";

    return isTopLevel
      ? `Top-level ${groupLevelLabel} as of period end`
      : `Drilled ${groupLevelLabel} as of period end`;
  }, [allocationDrillState.clampedPath.length, selectedAllocationBreakdown]);

  const currentAllocationLevelTotalAmount = useMemo(
    () =>
      allocationDrillState.currentNodes.reduce(
        (sum, breakdownNode) => sum + breakdownNode.amount,
        0,
      ),
    [allocationDrillState.currentNodes],
  );

  const allocationChartData = useMemo<PeriodBreakdownChartDatum[]>(
    () =>
      allocationDrillState.currentNodes.map((item) => {
        const percentage =
          currentAllocationLevelTotalAmount <= 0
            ? 0
            : (item.amount / currentAllocationLevelTotalAmount) * 100;

        return {
          id: item.id,
          label: item.label,
          kind: item.kind,
          amount: item.amount,
          percentage,
          isDrillable: isBreakdownNodeDrillable(item),
          amountLabel: currencyFormatter.format(item.amount),
          percentageLabel: `${percentageFormatter.format(percentage)}%`,
        };
      }),
    [
      allocationDrillState.currentNodes,
      currencyFormatter,
      currentAllocationLevelTotalAmount,
      percentageFormatter,
    ],
  );

  const totalAllocationAmountLabel = useMemo(
    () => currencyFormatter.format(currentAllocationLevelTotalAmount),
    [currentAllocationLevelTotalAmount, currencyFormatter],
  );

  const hasAllocationBreakdown = allocationChartData.length > 0;
  const currentAllocationBreakdownNodeId =
    allocationDrillState.currentPathNodes[
      allocationDrillState.currentPathNodes.length - 1
    ]?.id ?? null;

  const hasAllocationBreakdownAmountDiscrepancy = useMemo(() => {
    if (currentAllocationBreakdownNodeId == null) {
      return activeAllocationBreakdown.hasHiddenAmountDiscrepancy;
    }

    return activeAllocationBreakdown.hiddenAmountDiscrepancyNodeIds.includes(
      currentAllocationBreakdownNodeId,
    );
  }, [
    activeAllocationBreakdown.hasHiddenAmountDiscrepancy,
    activeAllocationBreakdown.hiddenAmountDiscrepancyNodeIds,
    currentAllocationBreakdownNodeId,
  ]);

  const updateSelectedAllocationBreakdownPath = useCallback(
    (nextPath: string[]) => {
      setDrillPathByAllocationBreakdown({
        ...drillPathByAllocationBreakdown,
        [selectedAllocationBreakdown]: nextPath,
      });
    },
    [
      drillPathByAllocationBreakdown,
      selectedAllocationBreakdown,
      setDrillPathByAllocationBreakdown,
    ],
  );

  const handleAllocationNodeDoubleClick = useCallback(
    (datum: PeriodBreakdownNodeDatum) => {
      if (
        datum.kind !== "group" ||
        !datum.isDrillable ||
        allocationDrillState.clampedPath.includes(datum.id)
      ) {
        return;
      }

      updateSelectedAllocationBreakdownPath([
        ...allocationDrillState.clampedPath,
        datum.id,
      ]);
    },
    [allocationDrillState.clampedPath, updateSelectedAllocationBreakdownPath],
  );

  const allocationChartOptions = usePeriodBreakdownChartOptions({
    chartData: allocationChartData,
    selectedChartType: selectedAllocationChartType,
    colors,
    totalBreakdownAmountLabel: totalAllocationAmountLabel,
    onNodeDoubleClick: handleAllocationNodeDoubleClick,
  });

  const hasAllocationPartialData =
    activeAllocationBreakdown.skippedMissingReferenceBalanceCount > 0 ||
    activeAllocationBreakdown.skippedNegativeCount > 0;

  const allocationPartialDataNotes = getAllocationPartialDataNotes({
    skippedMissingReferenceBalanceCount:
      activeAllocationBreakdown.skippedMissingReferenceBalanceCount,
    skippedNegativeCount: activeAllocationBreakdown.skippedNegativeCount,
  });

  const emptyAllocationBreakdownMessage =
    selectedAllocationBreakdown === "asset"
      ? "No positive, convertible asset balances were found as of period end."
      : "No positive, convertible liability balances were found as of period end.";

  return {
    activeAllocationBreakdown,
    allocationBreakdownTitle,
    allocationTableExpandedGroupsStorageKey,
    allocationBreakdownSubtitle,
    allocationDrillState,
    hasAllocationBreakdownAmountDiscrepancy,
    hasAllocationBreakdown,
    emptyAllocationBreakdownMessage,
    allocationChartOptions,
    updateSelectedAllocationBreakdownPath,
    hasAllocationPartialData,
    allocationPartialDataNotes,
  };
}
