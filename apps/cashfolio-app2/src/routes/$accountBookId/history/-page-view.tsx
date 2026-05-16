import {
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import type {
  AgChartInstance,
  AgChartOptions,
  AgSeriesVisibilityChange,
  AgZoomEvent,
} from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import type { PeriodHistoryResponse } from "@/server/period-history";
import { TopPageHeader } from "@/components/top-page-header";
import { PageShell } from "@/components/page-shell";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
} from "@/shared/unit-format";
import { useUserLocale } from "@/user-locale-context";
import {
  getHistoryMetricLabel,
  isHistoryPeriodMode,
  type HistoryMetric,
  type HistoryPeriodMode,
} from "./-page-types";
import {
  isHistoryScopedMetric,
  type HistoryScopeSelection,
} from "@/shared/history-scope";
import {
  addRollingAverageMetricToChartData,
  createHistoryChartOptions,
  mapHistoryPointsToChartData,
  prependOpeningBalanceChartDatum,
  rebaseHistoryChartDataCumulativeToVisibleRange,
  type HistoryVisibleRange,
} from "./-chart-options";
import { getDefaultRangeButtonLabel } from "./-range-controls";
import { HistoryScopeControls } from "./-scope-controls";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();

export type HistoryPageViewProps = {
  accountBookId: string;
  selectedMode: HistoryPeriodMode;
  selectedMetric: HistoryMetric;
  history: PeriodHistoryResponse;
  onModeChange: (mode: HistoryPeriodMode) => void;
  onMetricChange: (metric: HistoryMetric) => void;
  onMetricScopeChange: (scope: HistoryScopeSelection) => void;
};

function findHistoryRangeButtons(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      ".ag-charts-range-buttons--buttons .ag-charts-toolbar__button",
    ),
  );
}

function clickRangeButtonByLabel(args: {
  container: HTMLElement;
  label: string;
}): boolean {
  const matchingButton = findHistoryRangeButtons(args.container).find(
    (button) => {
      const buttonLabel = button
        .querySelector(".ag-charts-toolbar__label")
        ?.textContent?.trim();
      return buttonLabel === args.label;
    },
  );

  if (!matchingButton) {
    return false;
  }

  matchingButton.click();
  return true;
}

export function HistoryPageView({
  accountBookId,
  selectedMode,
  selectedMetric,
  history,
  onModeChange,
  onMetricChange,
  onMetricScopeChange,
}: HistoryPageViewProps) {
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
  const chartRef = useRef<AgChartInstance<AgChartOptions> | null>(null);
  const appliedDefaultRangeModeRef = useRef<HistoryPeriodMode | null>(null);
  const defaultRangeButtonLabel = useMemo(
    () => getDefaultRangeButtonLabel(selectedMode),
    [selectedMode],
  );
  const selectedMetricSeriesLabel = useMemo(() => {
    if (!isHistoryScopedMetric(selectedMetric)) {
      return undefined;
    }

    const selectedScope = history.scopeSelection[selectedMetric];
    if (selectedScope === "total") {
      return undefined;
    }

    return history.scopeOptions[selectedMetric].find(
      (option) => option.value === selectedScope,
    )?.label;
  }, [selectedMetric, history.scopeOptions, history.scopeSelection]);

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
        onZoom: handleChartZoom,
        onSeriesVisibilityChange: handleSeriesVisibilityChange,
      }),
    [
      amountCompactFormatter,
      rebasedChartData,
      colors,
      currencyFormatter,
      handleChartZoom,
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

  useEffect(() => {
    if (rebasedChartData.length === 0) {
      return;
    }

    if (appliedDefaultRangeModeRef.current === selectedMode) {
      return;
    }

    let animationFrameId = 0;
    const clickDefaultRangeButton = (attemptsLeft: number) => {
      const chartElement = chartRef.current?.getOptions().container;
      if (!(chartElement instanceof HTMLElement)) {
        if (attemptsLeft > 0) {
          animationFrameId = window.requestAnimationFrame(() =>
            clickDefaultRangeButton(attemptsLeft - 1),
          );
        }
        return;
      }

      if (
        clickRangeButtonByLabel({
          container: chartElement,
          label: defaultRangeButtonLabel,
        })
      ) {
        appliedDefaultRangeModeRef.current = selectedMode;
        return;
      }

      if (attemptsLeft > 0) {
        animationFrameId = window.requestAnimationFrame(() =>
          clickDefaultRangeButton(attemptsLeft - 1),
        );
      }
    };

    // Wait one frame so AG Charts can mount range-controls toolbar elements.
    animationFrameId = window.requestAnimationFrame(() =>
      clickDefaultRangeButton(4),
    );
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [defaultRangeButtonLabel, rebasedChartData, selectedMode]);

  useEffect(() => {
    setVisibleRangeX(null);
  }, [accountBookId, selectedMode]);

  return (
    <PageShell className={classes.page}>
      <TopPageHeader
        heading={<Title order={2}>History</Title>}
        actions={
          <SegmentedControl
            value={selectedMode}
            aria-label="History Period Mode"
            data={[
              { label: "Monthly", value: "month" },
              { label: "Yearly", value: "year" },
            ]}
            onChange={(nextMode) => {
              if (isHistoryPeriodMode(nextMode)) {
                onModeChange(nextMode);
              }
            }}
          />
        }
      />

      <Card withBorder radius="md" p="lg" className={classes.chartCard}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={4}>
            <Text fw={600}>
              {getHistoryMetricLabel(selectedMetric)} by Period
            </Text>
            <Text c="dimmed" size="sm">
              Amounts shown in {activeReferenceCurrency}
            </Text>
          </Stack>
          <div className={classes.metricControls}>
            <HistoryScopeControls
              selectedMetric={selectedMetric}
              scopeSelection={history.scopeSelection}
              scopeOptions={history.scopeOptions}
              onMetricChange={onMetricChange}
              onMetricScopeChange={onMetricScopeChange}
            />
          </div>
        </Group>

        {rebasedChartData.length === 0 ? (
          <Text c="dimmed" mt="md">
            No periods available yet.
          </Text>
        ) : (
          <div className={classes.chartContainer}>
            <AgCharts
              ref={chartRef}
              options={chartOptions}
              className={classes.chart}
            />
          </div>
        )}
      </Card>
    </PageShell>
  );
}
