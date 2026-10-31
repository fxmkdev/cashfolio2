import type { ReportingGrouping } from "@/shared/reporting-grouping";
import {
  useCallback,
  useMemo,
  useRef,
  type MouseEventHandler,
  type MouseEvent,
} from "react";
import { getReportNodeLabel } from "./-account-label";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import type { getPeriodOverview } from "@/server/period";
import {
  getBreakdownDrillState,
  isBreakdownNodeDrillable,
  parseBreakdownAccountId,
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
type DrillPathByAllocationBreakdownUpdater =
  | DrillPathByAllocationBreakdown
  | ((
      previousValue: DrillPathByAllocationBreakdown,
    ) => DrillPathByAllocationBreakdown);

function getAllocationPartialDataNotes(count: number): string {
  if (count === 0) return "";
  const accountLabel = count === 1 ? "account was" : "accounts were";
  return `${count} ${accountLabel} skipped because reference-currency balances were unavailable. This affects both asset and liability allocations.`;
}

export type PeriodAllocationBreakdownViewModel = {
  activeAllocationBreakdown: PeriodOverview["accountBreakdownsByGrouping"]["accountStructure"]["assetBreakdown"];
  allocationBreakdownTitle: string;
  allocationTableExpandedGroupsStorageKey: string;
  allocationBreakdownSubtitle: string;
  allocationDrillState: ReturnType<typeof getBreakdownDrillState>;
  hasAllocationBreakdownAmountDiscrepancy: boolean;
  hasAllocationBreakdown: boolean;
  emptyAllocationBreakdownMessage: string;
  allocationChartOptions: ReturnType<typeof usePeriodBreakdownChartOptions>;
  updateSelectedAllocationBreakdownPath: (nextPath: string[]) => void;
  handleAllocationChartContainerDoubleClick: MouseEventHandler<HTMLDivElement> | null;
  hasAllocationPartialData: boolean;
  allocationPartialDataNotes: string;
};

export function usePeriodAllocationBreakdownViewModel(args: {
  accountBookId: string;
  grouping: ReportingGrouping;
  overview: PeriodOverview;
  selectedAllocationBreakdown: AllocationBreakdownType;
  selectedAllocationChartType: BreakdownChartType;
  drillPathByAllocationBreakdown: DrillPathByAllocationBreakdown;
  setDrillPathByAllocationBreakdown: (
    nextValue: DrillPathByAllocationBreakdownUpdater,
  ) => void;
  currencyFormatter: Intl.NumberFormat;
  percentageFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  onBreakdownAccountDoubleClick: (accountId: string) => void;
}): PeriodAllocationBreakdownViewModel {
  const {
    accountBookId,
    grouping,
    overview,
    selectedAllocationBreakdown,
    selectedAllocationChartType,
    drillPathByAllocationBreakdown,
    setDrillPathByAllocationBreakdown,
    currencyFormatter,
    percentageFormatter,
    colors,
    onBreakdownAccountDoubleClick,
  } = args;

  const accountBreakdowns = overview.accountBreakdownsByGrouping[grouping];
  const activeAllocationBreakdown =
    selectedAllocationBreakdown === "asset"
      ? accountBreakdowns.assetBreakdown
      : accountBreakdowns.liabilityBreakdown;

  const allocationBreakdownTitle =
    selectedAllocationBreakdown === "asset"
      ? "Assets Allocation"
      : "Liabilities Allocation";
  const allocationTableExpandedGroupsStorageKey = `cashfolio:periodExpandedGroups:${accountBookId}:allocation:${selectedAllocationBreakdown}:${grouping}`;
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
      allocationDrillState.clampedPath.length === 0
        ? activeAllocationBreakdown.totalAmount
        : allocationDrillState.currentPathNodes.at(-1)!.amount,
    [allocationDrillState, activeAllocationBreakdown.totalAmount],
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
          label: getReportNodeLabel(item),
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
      setDrillPathByAllocationBreakdown(
        (previousDrillPathByAllocationBreakdown) => ({
          ...previousDrillPathByAllocationBreakdown,
          [selectedAllocationBreakdown]: nextPath,
        }),
      );
    },
    [selectedAllocationBreakdown, setDrillPathByAllocationBreakdown],
  );

  const handledDoubleClicks = useRef(new WeakSet<Event>());
  const handleAllocationNodeDoubleClick = useCallback(
    (datum: PeriodBreakdownNodeDatum, event: Event) => {
      if (handledDoubleClicks.current.has(event)) return;
      handledDoubleClicks.current.add(event);
      if (datum.kind === "group") {
        if (
          !datum.isDrillable ||
          allocationDrillState.clampedPath.includes(datum.id)
        ) {
          return;
        }

        updateSelectedAllocationBreakdownPath([
          ...allocationDrillState.clampedPath,
          datum.id,
        ]);
        return;
      }

      const accountId = parseBreakdownAccountId(datum.id);
      if (!accountId) {
        return;
      }

      onBreakdownAccountDoubleClick(accountId);
    },
    [
      allocationDrillState.clampedPath,
      onBreakdownAccountDoubleClick,
      updateSelectedAllocationBreakdownPath,
    ],
  );

  const allocationChartOptions = usePeriodBreakdownChartOptions({
    chartData: allocationChartData,
    selectedChartType: selectedAllocationChartType,
    colors,
    totalBreakdownAmountLabel: totalAllocationAmountLabel,
    onNodeDoubleClick: handleAllocationNodeDoubleClick,
  });
  const handleAllocationChartContainerDoubleClick = useMemo(() => {
    if (allocationChartData.length !== 1) {
      return null;
    }

    return (event: MouseEvent<HTMLDivElement>) => {
      const onlyNode = allocationChartData[0];
      if (onlyNode) {
        handleAllocationNodeDoubleClick(onlyNode, event.nativeEvent);
      }
    };
  }, [allocationChartData, handleAllocationNodeDoubleClick]);

  const hasAllocationPartialData =
    activeAllocationBreakdown.skippedMissingReferenceBalanceCount > 0;

  const allocationPartialDataNotes = getAllocationPartialDataNotes(
    activeAllocationBreakdown.skippedMissingReferenceBalanceCount,
  );

  const emptyAllocationBreakdownMessage =
    selectedAllocationBreakdown === "asset"
      ? "No positive, convertible account balances were found as of period end."
      : "No negative, convertible account balances were found as of period end.";

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
    handleAllocationChartContainerDoubleClick,
    hasAllocationPartialData,
    allocationPartialDataNotes,
  };
}
