import type { ReportingGrouping } from "@/shared/reporting-grouping";
import {
  useCallback,
  useMemo,
  useRef,
  type MouseEventHandler,
  type MouseEvent,
} from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import type { getPeriodOverview } from "@/server/period";
import { useGainsLossesWaterfallChartOptions } from "./-gains-losses/-gains-losses-chart-options";
import { getGainsLossesDrillState } from "./-gains-losses/-gains-losses-drill";
import { buildGainsLossesWaterfallModel } from "./-gains-losses/-gains-losses-waterfall-model";
import type { GainsLossesChartType } from "./-breakdown/-breakdown-types";
import { handleGainsLossesDoubleClick } from "./-gains-losses/-gains-losses-double-click";

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
  handleChartContainerDoubleClick: MouseEventHandler<HTMLDivElement> | null;
};

export function usePeriodGainsLossesViewModel(args: {
  accountBookId: string;
  grouping: ReportingGrouping;
  gainsLossesBreakdown: PeriodOverview["accountBreakdownsByGrouping"]["assetClass"]["gainsLossesBreakdown"];
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
  onUnitAccountDoubleClick?: (accountId: string) => void;
}): PeriodGainsLossesViewModel {
  const {
    accountBookId,
    grouping,
    gainsLossesBreakdown,
    selectedGainsLossesChartType,
    drillPathByGainsLosses,
    setDrillPathByGainsLosses,
    currencyFormatter,
    colors,
    waterfallPalette,
    onUnitAccountDoubleClick,
  } = args;
  const gainsLossesBreakdownHierarchy = gainsLossesBreakdown.hierarchy;
  const gainsLossesTableExpandedGroupsStorageKey = `cashfolio:periodExpandedGroups:${accountBookId}:gains-losses:v3:${grouping}`;
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
        totalGainLoss:
          gainsLossesDrillState.currentPathNodes.at(-1)?.totalGainLoss ??
          gainsLossesBreakdown.totalGainLoss,
      }),
    [
      gainsLossesDrillState.currentNodes,
      gainsLossesDrillState.currentPathNodes,
      gainsLossesBreakdown.totalGainLoss,
    ],
  );
  const hasGainsLosses = waterfallModel.data.length > 0;
  const updateGainsLossesDrillPath = useCallback(
    (nextPath: string[]) => {
      setDrillPathByGainsLosses(nextPath);
    },
    [setDrillPathByGainsLosses],
  );
  const handledDoubleClicks = useRef(new WeakSet<Event>());
  const handleNodeDoubleClick = useCallback(
    (datum: (typeof waterfallModel)["data"][number], event: Event) => {
      handleGainsLossesDoubleClick({
        event,
        handledEvents: handledDoubleClicks.current,
        datum,
        currentNodes: gainsLossesDrillState.currentNodes,
        path: gainsLossesDrillState.clampedPath,
        onOpenAccount: onUnitAccountDoubleClick,
        onDrill: updateGainsLossesDrillPath,
      });
    },
    [
      gainsLossesDrillState.clampedPath,
      gainsLossesDrillState.currentNodes,
      onUnitAccountDoubleClick,
      updateGainsLossesDrillPath,
    ],
  );
  const gainsLossesChartOptions = useGainsLossesWaterfallChartOptions({
    chartData: waterfallModel.data,
    totals: waterfallModel.totals,
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

    return (event: MouseEvent<HTMLDivElement>) => {
      const onlyNode = waterfallModel.data[0];
      if (onlyNode) {
        handleNodeDoubleClick(onlyNode, event.nativeEvent);
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
