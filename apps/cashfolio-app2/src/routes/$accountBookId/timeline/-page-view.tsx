import {
  Card,
  Container,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconCalendarMonth, IconListDetails } from "@tabler/icons-react";
import type {
  AgChartInstance,
  AgChartOptions,
  AgZoomEvent,
} from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { LinkButton } from "@/components/link-button";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import { TopPageHeader } from "@/components/top-page-header";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
} from "@/shared/unit-format";
import {
  getTimelineMetricLabel,
  isTimelineMetric,
  isTimelinePeriodMode,
  TIMELINE_METRIC_OPTIONS,
  type TimelineMetric,
  type TimelinePeriodMode,
} from "./-page-types";
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
  rebaseTimelineChartDataCumulativeToVisibleRange,
  type TimelineVisibleRange,
} from "./-chart-options";
import { getDefaultRangeButtonLabel } from "./-range-controls";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();

export type TimelinePageViewProps = {
  accountBookId: string;
  selectedMode: TimelinePeriodMode;
  selectedMetric: TimelineMetric;
  timeline: PeriodTimelineResponse;
  onModeChange: (mode: TimelinePeriodMode) => void;
  onMetricChange: (metric: TimelineMetric) => void;
};

function findTimelineRangeButtons(container: HTMLElement): HTMLElement[] {
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
  const matchingButton = findTimelineRangeButtons(args.container).find(
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

export function TimelinePageView({
  accountBookId,
  selectedMode,
  selectedMetric,
  timeline,
  onModeChange,
  onMetricChange,
}: TimelinePageViewProps) {
  const activeReferenceCurrency = timeline.referenceCurrency;
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const colors = useMemo(
    () => getDashboardChartThemeColors({ theme, isDarkMode }),
    [theme, isDarkMode],
  );

  const currencyFormatter = useMemo(
    () =>
      createDisplayNumberFormatter({
        locale: "en-CH",
        style: "currency",
        currency: activeReferenceCurrency,
        decimals: getCurrencyDecimals(activeReferenceCurrency),
      }),
    [activeReferenceCurrency],
  );

  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );

  const chartData = useMemo(
    () => mapTimelinePointsToChartData(timeline.points),
    [timeline.points],
  );
  const [visibleRangeX, setVisibleRangeX] =
    useState<TimelineVisibleRange | null>(null);
  const rebasedChartData = useMemo(
    () =>
      rebaseTimelineChartDataCumulativeToVisibleRange({
        chartData,
        visibleRangeX,
        selectedMetric,
      }),
    [chartData, selectedMetric, visibleRangeX],
  );
  const chartRef = useRef<AgChartInstance<AgChartOptions> | null>(null);
  const appliedDefaultRangeModeRef = useRef<TimelinePeriodMode | null>(null);
  const defaultRangeButtonLabel = useMemo(
    () => getDefaultRangeButtonLabel(selectedMode),
    [selectedMode],
  );

  const handleChartZoom = useCallback(
    (event: AgZoomEvent) => {
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

  const chartOptions = useMemo(
    () =>
      createTimelineChartOptions({
        chartData: rebasedChartData,
        periodMode: selectedMode,
        selectedMetric,
        amountCompactFormatter,
        currencyFormatter,
        colors,
        theme,
        isDarkMode,
        onZoom: handleChartZoom,
      }),
    [
      amountCompactFormatter,
      rebasedChartData,
      colors,
      currencyFormatter,
      handleChartZoom,
      selectedMode,
      selectedMetric,
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
  }, [selectedMode, timeline.points]);

  return (
    <Container fluid py="xl" px="xl" className={classes.page}>
      <TopPageHeader
        heading={<Title order={2}>Timeline</Title>}
        actions={
          <Group gap="sm">
            <LinkButton
              variant="default"
              leftSection={<IconListDetails size={16} />}
              to="/$accountBookId/accounts"
              params={{ accountBookId }}
              search={{ tab: "ASSET", mode: "active" }}
            >
              Accounts
            </LinkButton>
            <LinkButton
              variant="default"
              leftSection={<IconCalendarMonth size={16} />}
              to="/$accountBookId/period"
              params={{ accountBookId }}
            >
              Period
            </LinkButton>
            <SegmentedControl
              value={selectedMode}
              aria-label="Timeline period mode"
              data={[
                { label: "Monthly", value: "month" },
                { label: "Yearly", value: "year" },
              ]}
              onChange={(nextMode) => {
                if (isTimelinePeriodMode(nextMode)) {
                  onModeChange(nextMode);
                }
              }}
            />
          </Group>
        }
      />

      <Card withBorder radius="md" p="lg" className={classes.chartCard}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={4}>
            <Text fw={600}>
              {getTimelineMetricLabel(selectedMetric)} by Period
            </Text>
            <Text c="dimmed" size="sm">
              Amounts shown in {activeReferenceCurrency}
            </Text>
          </Stack>
          <SegmentedControl
            value={selectedMetric}
            aria-label="Timeline metric"
            data={TIMELINE_METRIC_OPTIONS}
            onChange={(nextMetric) => {
              if (isTimelineMetric(nextMetric)) {
                onMetricChange(nextMetric);
              }
            }}
          />
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
    </Container>
  );
}
