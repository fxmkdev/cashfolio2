import { useCallback, useMemo } from "react";
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
import type { BreakdownChartType, BreakdownType } from "./-breakdown-types";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

type DrillPathByBreakdown = Record<BreakdownType, string[]>;

export type PeriodBreakdownViewModel = {
  activeBreakdown: PeriodOverview["expenseBreakdown"];
  breakdownTitle: string;
  breakdownTableExpandedGroupsStorageKey: string;
  breakdownSubtitle: string;
  drillState: ReturnType<typeof getBreakdownDrillState>;
  hasBreakdownAmountDiscrepancy: boolean;
  hasBreakdown: boolean;
  emptyBreakdownMessage: string;
  chartOptions: ReturnType<typeof usePeriodBreakdownChartOptions>;
  updateSelectedBreakdownPath: (nextPath: string[]) => void;
  handleChartContainerDoubleClick: (() => void) | null;
};

export function usePeriodBreakdownViewModel(args: {
  accountBookId: string;
  overview: PeriodOverview;
  selectedBreakdown: BreakdownType;
  selectedChartType: BreakdownChartType;
  drillPathByBreakdown: DrillPathByBreakdown;
  setDrillPathByBreakdown: (nextValue: DrillPathByBreakdown) => void;
  currencyFormatter: Intl.NumberFormat;
  percentageFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  onBreakdownAccountDoubleClick: (accountId: string) => void;
}): PeriodBreakdownViewModel {
  const {
    accountBookId,
    overview,
    selectedBreakdown,
    selectedChartType,
    drillPathByBreakdown,
    setDrillPathByBreakdown,
    currencyFormatter,
    percentageFormatter,
    colors,
    onBreakdownAccountDoubleClick,
  } = args;

  const activeBreakdown = useMemo(
    () =>
      selectedBreakdown === "expense"
        ? overview.expenseBreakdown
        : overview.incomeBreakdown,
    [overview.expenseBreakdown, overview.incomeBreakdown, selectedBreakdown],
  );

  const breakdownTitle =
    selectedBreakdown === "expense" ? "Expenses Breakdown" : "Income Breakdown";
  const breakdownTableExpandedGroupsStorageKey = `cashfolio:periodExpandedGroups:${accountBookId}:breakdown:${selectedBreakdown}`;
  const breakdownRootLabel =
    selectedBreakdown === "expense" ? "All Expenses" : "All Income";
  const drillState = useMemo(
    () =>
      getBreakdownDrillState({
        hierarchy: activeBreakdown.hierarchy,
        path: drillPathByBreakdown[selectedBreakdown],
        rootLabel: breakdownRootLabel,
      }),
    [
      activeBreakdown.hierarchy,
      breakdownRootLabel,
      drillPathByBreakdown,
      selectedBreakdown,
    ],
  );

  const breakdownSubtitle = useMemo(() => {
    const isTopLevel = drillState.clampedPath.length === 0;

    if (isTopLevel) {
      return selectedBreakdown === "expense"
        ? "Top-level groups for expenses in the selected period"
        : "Top-level groups for income in the selected period";
    }

    return selectedBreakdown === "expense"
      ? "Drilled expense groups in the selected period"
      : "Drilled income groups in the selected period";
  }, [drillState.clampedPath.length, selectedBreakdown]);

  const currentBreakdownLevelTotalAmount = useMemo(
    () =>
      drillState.currentNodes.reduce(
        (sum, breakdownNode) => sum + breakdownNode.amount,
        0,
      ),
    [drillState.currentNodes],
  );

  const chartData = useMemo<PeriodBreakdownChartDatum[]>(
    () =>
      drillState.currentNodes.map((item) => {
        const percentage =
          currentBreakdownLevelTotalAmount <= 0
            ? 0
            : (item.amount / currentBreakdownLevelTotalAmount) * 100;

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
      currentBreakdownLevelTotalAmount,
      currencyFormatter,
      drillState.currentNodes,
      percentageFormatter,
    ],
  );

  const totalBreakdownAmountLabel = useMemo(
    () => currencyFormatter.format(currentBreakdownLevelTotalAmount),
    [currentBreakdownLevelTotalAmount, currencyFormatter],
  );

  const hasBreakdown = chartData.length > 0;
  const currentBreakdownNodeId =
    drillState.currentPathNodes[drillState.currentPathNodes.length - 1]?.id ??
    null;

  const hasBreakdownAmountDiscrepancy = useMemo(() => {
    if (currentBreakdownNodeId == null) {
      return activeBreakdown.hasHiddenAmountDiscrepancy;
    }

    return activeBreakdown.hiddenAmountDiscrepancyNodeIds.includes(
      currentBreakdownNodeId,
    );
  }, [
    activeBreakdown.hasHiddenAmountDiscrepancy,
    activeBreakdown.hiddenAmountDiscrepancyNodeIds,
    currentBreakdownNodeId,
  ]);

  const updateSelectedBreakdownPath = useCallback(
    (nextPath: string[]) => {
      setDrillPathByBreakdown({
        ...drillPathByBreakdown,
        [selectedBreakdown]: nextPath,
      });
    },
    [drillPathByBreakdown, selectedBreakdown, setDrillPathByBreakdown],
  );

  const handleNodeDoubleClick = useCallback(
    (datum: PeriodBreakdownNodeDatum) => {
      if (datum.kind === "group") {
        if (!datum.isDrillable || drillState.clampedPath.includes(datum.id)) {
          return;
        }

        updateSelectedBreakdownPath([...drillState.clampedPath, datum.id]);
        return;
      }

      const accountId = parseBreakdownAccountId(datum.id);
      if (!accountId) {
        return;
      }

      onBreakdownAccountDoubleClick(accountId);
    },
    [
      drillState.clampedPath,
      onBreakdownAccountDoubleClick,
      updateSelectedBreakdownPath,
    ],
  );

  const chartOptions = usePeriodBreakdownChartOptions({
    chartData,
    selectedChartType,
    colors,
    totalBreakdownAmountLabel,
    onNodeDoubleClick: handleNodeDoubleClick,
  });

  const handleChartContainerDoubleClick = useMemo(() => {
    if (chartData.length !== 1) {
      return null;
    }

    return () => {
      const onlyNode = chartData[0];
      if (onlyNode) {
        handleNodeDoubleClick(onlyNode);
      }
    };
  }, [chartData, handleNodeDoubleClick]);

  const emptyBreakdownMessage =
    selectedBreakdown === "expense"
      ? "No expenses were found for this period."
      : "No income was found for this period.";

  return {
    activeBreakdown,
    breakdownTitle,
    breakdownTableExpandedGroupsStorageKey,
    breakdownSubtitle,
    drillState,
    hasBreakdownAmountDiscrepancy,
    hasBreakdown,
    emptyBreakdownMessage,
    chartOptions,
    updateSelectedBreakdownPath,
    handleChartContainerDoubleClick,
  };
}
