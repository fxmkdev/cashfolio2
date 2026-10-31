import { useComputedColorScheme, useMantineTheme } from "@mantine/core";
import type {
  AgSeriesVisibilityChange,
  AgZoomEvent,
} from "ag-charts-community";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PeriodHistoryResponse } from "@/server/period-history";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
} from "@/shared/unit-format";
import { useUserLocale } from "@/user-locale-context";
import type { HistoryMetric, HistoryPeriodMode } from "./-page-types";
import {
  addRollingAverageMetricToChartData,
  createHistoryChartOptions,
  mapHistoryPointsToChartData,
  prependOpeningBalanceChartDatum,
  rebaseHistoryChartDataCumulativeToVisibleRange,
  type HistoryVisibleRange,
} from "./-chart-options";
import type { HistoryAccountDrillTarget } from "./-account-drilldown";
import { useDefaultHistoryChartRange } from "./-use-default-chart-range";

export type HistoryChartModelArgs = {
  accountBookId: string;
  selectedMode: HistoryPeriodMode;
  selectedMetric: HistoryMetric;
  history: PeriodHistoryResponse;
  selectedMetricSeriesLabel?: string;
  drillTarget: HistoryAccountDrillTarget | null;
  onAccountPeriodDoubleClick: (
    target: HistoryAccountDrillTarget,
    periodValue: string,
  ) => void;
};

export function useHistoryChartModel({
  accountBookId,
  selectedMode,
  selectedMetric,
  history,
  selectedMetricSeriesLabel,
  drillTarget,
  onAccountPeriodDoubleClick,
}: HistoryChartModelArgs) {
  const userLocale = useUserLocale();
  const activeReferenceCurrency = history.referenceCurrency;
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const colors = useMemo(
    () => getDashboardChartThemeColors({ theme, isDarkMode }),
    [theme, isDarkMode],
  );

  const currencyFormatter = useMemo(
    () =>
      createDisplayNumberFormatter({
        locale: userLocale,
        style: "currency",
        currency: activeReferenceCurrency,
        decimals: getCurrencyDecimals(activeReferenceCurrency),
      }),
    [activeReferenceCurrency, userLocale],
  );

  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(userLocale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [userLocale],
  );
  const pointDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(userLocale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC",
      }),
    [userLocale],
  );

  const baseChartData = useMemo(
    () =>
      addRollingAverageMetricToChartData({
        chartData: mapHistoryPointsToChartData(history.points),
        selectedMetric,
        periodMode: selectedMode,
      }),
    [selectedMetric, selectedMode, history.points],
  );
  const chartData = useMemo(
    () =>
      prependOpeningBalanceChartDatum({
        chartData: baseChartData,
        selectedMetric,
        openingBalancePoint: history.openingBalancePoint,
      }),
    [baseChartData, selectedMetric, history.openingBalancePoint],
  );
  const [visibleRangeX, setVisibleRangeX] =
    useState<HistoryVisibleRange | null>(null);
  const [isCumulativeSeriesVisible, setIsCumulativeSeriesVisible] =
    useState(false);
  const rebasedChartData = useMemo(
    () =>
      rebaseHistoryChartDataCumulativeToVisibleRange({
        chartData,
        visibleRangeX,
        selectedMetric,
      }),
    [chartData, selectedMetric, visibleRangeX],
  );
  const handleChartZoom = useCallback((event: AgZoomEvent) => {
    const nextRange = event.rangeX
      ? { start: event.rangeX.start, end: event.rangeX.end }
      : null;

    setVisibleRangeX((previousRange) => {
      const previousStart = previousRange?.start?.valueOf();
      const previousEnd = previousRange?.end?.valueOf();
      const nextStart = nextRange?.start?.valueOf();
      const nextEnd = nextRange?.end?.valueOf();
      if (previousStart === nextStart && previousEnd === nextEnd) {
        return previousRange;
      }

      return nextRange;
    });
  }, []);

  const handleSeriesVisibilityChange = useCallback(
    (event: AgSeriesVisibilityChange) => {
      if (event.itemId !== "cumulativeMetric") {
        return;
      }

      setIsCumulativeSeriesVisible(event.visible);
    },
    [],
  );

  const handlePeriodDoubleClick = useCallback(
    (periodValue: string) => {
      if (drillTarget) onAccountPeriodDoubleClick(drillTarget, periodValue);
    },
    [drillTarget, onAccountPeriodDoubleClick],
  );

  const chartOptions = useMemo(
    () =>
      createHistoryChartOptions({
        chartData: rebasedChartData,
        periodMode: selectedMode,
        selectedMetric,
        selectedMetricSeriesLabel,
        showCumulativeSeries: isCumulativeSeriesVisible,
        amountCompactFormatter,
        currencyFormatter,
        pointDateFormatter,
        colors,
        theme,
        isDarkMode,
        onPeriodDoubleClick: drillTarget ? handlePeriodDoubleClick : undefined,
        onZoom: handleChartZoom,
        onSeriesVisibilityChange: handleSeriesVisibilityChange,
      }),
    [
      amountCompactFormatter,
      rebasedChartData,
      colors,
      currencyFormatter,
      handleChartZoom,
      drillTarget,
      handlePeriodDoubleClick,
      handleSeriesVisibilityChange,
      isCumulativeSeriesVisible,
      pointDateFormatter,
      selectedMode,
      selectedMetric,
      selectedMetricSeriesLabel,
      isDarkMode,
      theme,
    ],
  );

  const chartRef = useDefaultHistoryChartRange({
    selectedMode,
    chartData: rebasedChartData,
  });
  useEffect(() => {
    setVisibleRangeX(null);
  }, [accountBookId, selectedMode]);

  return { chartRef, chartOptions, chartData: rebasedChartData };
}
