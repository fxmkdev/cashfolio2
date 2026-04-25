import { useCallback, useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import type { getPeriodOverview } from "@/server/period";
import { useGainsLossesWaterfallChartOptions } from "./-gains-losses-chart-options";
import { getGainsLossesDrillState } from "./-gains-losses-drill";
import { buildGainsLossesWaterfallModel } from "./-gains-losses-waterfall-model";
import type { GainsLossesChartType } from "./-breakdown-types";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

export type PeriodGainsLossesViewModel = {
  gainsLossesTableExpandedGroupsStorageKey: string;
  gainsLossesSubtitle: string;
  gainsLossesDrillState: ReturnType<typeof getGainsLossesDrillState>;
  hasGainsLosses: boolean;
  emptyGainsLossesMessage: string;
  gainsLossesChartOptions: ReturnType<
    typeof useGainsLossesWaterfallChartOptions
  >;
  updateGainsLossesDrillPath: (nextPath: string[]) => void;
  handleChartContainerDoubleClick: (() => void) | null;
};

export function usePeriodGainsLossesViewModel(args: {
  accountBookId: string;
  gainsLossesBreakdownHierarchy: PeriodOverview["gainsLossesBreakdown"]["hierarchy"];
  selectedGainsLossesChartType: GainsLossesChartType;
  drillPathByGainsLosses: string[];
  setDrillPathByGainsLosses: (
    nextValue: string[] | ((previousValue: string[]) => string[]),
  ) => void;
  currencyFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  waterfallPalette: {
    positive: string;
    negative: string;
    total: string;
  };
}): PeriodGainsLossesViewModel {
  const {
    accountBookId,
    gainsLossesBreakdownHierarchy,
    selectedGainsLossesChartType,
    drillPathByGainsLosses,
    setDrillPathByGainsLosses,
    currencyFormatter,
    colors,
    waterfallPalette,
  } = args;
  const gainsLossesTableExpandedGroupsStorageKey = `cashfolio:periodExpandedGroups:${accountBookId}:gains-losses`;
  const gainsLossesDrillState = useMemo(
    () =>
      getGainsLossesDrillState({
        hierarchy: gainsLossesBreakdownHierarchy,
        path: drillPathByGainsLosses,
        rootLabel: "All Gains/Losses",
      }),
    [drillPathByGainsLosses, gainsLossesBreakdownHierarchy],
  );
  const gainsLossesSubtitle = useMemo(
    () =>
      gainsLossesDrillState.clampedPath.length === 0
        ? "Top-level groups for gains/losses in the selected period"
        : "Drilled gains/losses in the selected period",
    [gainsLossesDrillState.clampedPath.length],
  );

  const waterfallModel = useMemo(
    () =>
      buildGainsLossesWaterfallModel({
        nodes: gainsLossesDrillState.currentNodes,
      }),
    [gainsLossesDrillState.currentNodes],
  );
  const hasGainsLosses = waterfallModel.data.length > 0;
  const updateGainsLossesDrillPath = useCallback(
    (nextPath: string[]) => {
      setDrillPathByGainsLosses(nextPath);
    },
    [setDrillPathByGainsLosses],
  );
  const handleNodeDoubleClick = useCallback(
    (datum: (typeof waterfallModel)["data"][number]) => {
      if (
        !datum.isDrillable ||
        gainsLossesDrillState.clampedPath.includes(datum.id)
      ) {
        return;
      }

      updateGainsLossesDrillPath([
        ...gainsLossesDrillState.clampedPath,
        datum.id,
      ]);
    },
    [gainsLossesDrillState.clampedPath, updateGainsLossesDrillPath],
  );
  const gainsLossesChartOptions = useGainsLossesWaterfallChartOptions({
    chartData: waterfallModel.data,
    totals: waterfallModel.totals,
    totalRealizedGainLoss: waterfallModel.totalRealizedGainLoss,
    totalUnrealizedGainLoss: waterfallModel.totalUnrealizedGainLoss,
    totalGainLoss: waterfallModel.totalGainLoss,
    totalAxisLabel: waterfallModel.totalAxisLabel,
    colors,
    waterfallPalette,
    currencyFormatter,
    onNodeDoubleClick: handleNodeDoubleClick,
  });
  const handleChartContainerDoubleClick = useMemo(() => {
    if (
      selectedGainsLossesChartType !== "waterfall" ||
      waterfallModel.data.length !== 1
    ) {
      return null;
    }

    return () => {
      const onlyNode = waterfallModel.data[0];
      if (onlyNode) {
        handleNodeDoubleClick(onlyNode);
      }
    };
  }, [handleNodeDoubleClick, selectedGainsLossesChartType, waterfallModel]);

  return {
    gainsLossesTableExpandedGroupsStorageKey,
    gainsLossesSubtitle,
    gainsLossesDrillState,
    hasGainsLosses,
    emptyGainsLossesMessage: "No gains/losses were found for this period.",
    gainsLossesChartOptions,
    updateGainsLossesDrillPath,
    handleChartContainerDoubleClick,
  };
}
