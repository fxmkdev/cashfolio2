import { useCallback, useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import type { getPeriodOverview } from "@/server/period";
import {
  getBreakdownDrillState,
  isBreakdownNodeDrillable,
} from "./-breakdown-drill";
import {
  type GainsLossesBreakdownChartDatum,
  useGainsLossesWaterfallChartOptions,
} from "./-gains-losses-waterfall-chart-options";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

type DrillPathByGainsLossesBreakdown = string[];
type DrillPathByGainsLossesBreakdownUpdater =
  | DrillPathByGainsLossesBreakdown
  | ((
      previousValue: DrillPathByGainsLossesBreakdown,
    ) => DrillPathByGainsLossesBreakdown);

export type PeriodGainsLossesBreakdownViewModel = {
  gainsLossesBreakdownSubtitle: string;
  gainsLossesBreakdownDrillState: ReturnType<typeof getBreakdownDrillState>;
  hasGainsLossesBreakdown: boolean;
  gainsLossesBreakdownChartOptions: ReturnType<
    typeof useGainsLossesWaterfallChartOptions
  >;
  updateGainsLossesBreakdownPath: (nextPath: string[]) => void;
};

export function usePeriodGainsLossesBreakdownViewModel(args: {
  overview: PeriodOverview;
  drillPathByGainsLossesBreakdown: DrillPathByGainsLossesBreakdown;
  setDrillPathByGainsLossesBreakdown: (
    nextValue: DrillPathByGainsLossesBreakdownUpdater,
  ) => void;
  currencyFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  waterfallPalette: {
    positive: string;
    negative: string;
    total: string;
  };
}): PeriodGainsLossesBreakdownViewModel {
  const {
    overview,
    drillPathByGainsLossesBreakdown,
    setDrillPathByGainsLossesBreakdown,
    currencyFormatter,
    colors,
    waterfallPalette,
  } = args;

  const gainsLossesBreakdownDrillState = useMemo(
    () =>
      getBreakdownDrillState({
        hierarchy: overview.gainsLossesBreakdown.hierarchy,
        path: drillPathByGainsLossesBreakdown,
        rootLabel: "All Gains/Losses",
      }),
    [drillPathByGainsLossesBreakdown, overview.gainsLossesBreakdown.hierarchy],
  );

  const gainsLossesBreakdownCurrentPathNode =
    gainsLossesBreakdownDrillState.currentPathNodes[
      gainsLossesBreakdownDrillState.currentPathNodes.length - 1
    ] ?? null;

  const gainsLossesBreakdownSubtitle = useMemo(() => {
    if (gainsLossesBreakdownDrillState.clampedPath.length === 0) {
      return `Unit-type gains/losses contributors in the selected period · Amounts shown in ${overview.referenceCurrency}`;
    }

    const currentUnitLabel =
      gainsLossesBreakdownCurrentPathNode?.label ?? "Unit";

    return `${currentUnitLabel} contributors in the selected period · Amounts shown in ${overview.referenceCurrency}`;
  }, [
    gainsLossesBreakdownCurrentPathNode?.label,
    gainsLossesBreakdownDrillState.clampedPath.length,
    overview.referenceCurrency,
  ]);

  const gainsLossesBreakdownChartData = useMemo<
    GainsLossesBreakdownChartDatum[]
  >(
    () =>
      gainsLossesBreakdownDrillState.currentNodes.map((node) => ({
        id: node.id,
        label: node.label,
        amount: node.amount,
        isDrillable: isBreakdownNodeDrillable(node),
      })),
    [gainsLossesBreakdownDrillState.currentNodes],
  );

  const hasGainsLossesBreakdown = gainsLossesBreakdownChartData.some(
    (datum) => datum.amount !== 0,
  );

  const gainsLossesTotalAxisLabel = gainsLossesBreakdownCurrentPathNode
    ? `Total ${gainsLossesBreakdownCurrentPathNode.label}`
    : "Total Gains/Losses";

  const updateGainsLossesBreakdownPath = useCallback(
    (nextPath: string[]) => {
      setDrillPathByGainsLossesBreakdown(nextPath);
    },
    [setDrillPathByGainsLossesBreakdown],
  );

  const handleGainsLossesNodeDoubleClick = useCallback(
    (datum: GainsLossesBreakdownChartDatum) => {
      if (
        !datum.isDrillable ||
        gainsLossesBreakdownDrillState.clampedPath.includes(datum.id)
      ) {
        return;
      }

      updateGainsLossesBreakdownPath([
        ...gainsLossesBreakdownDrillState.clampedPath,
        datum.id,
      ]);
    },
    [
      gainsLossesBreakdownDrillState.clampedPath,
      updateGainsLossesBreakdownPath,
    ],
  );

  const gainsLossesBreakdownChartOptions = useGainsLossesWaterfallChartOptions({
    chartData: gainsLossesBreakdownChartData,
    colors,
    currencyFormatter,
    waterfallPalette,
    totalAxisLabel: gainsLossesTotalAxisLabel,
    onNodeDoubleClick: handleGainsLossesNodeDoubleClick,
  });

  return {
    gainsLossesBreakdownSubtitle,
    gainsLossesBreakdownDrillState,
    hasGainsLossesBreakdown,
    gainsLossesBreakdownChartOptions,
    updateGainsLossesBreakdownPath,
  };
}
