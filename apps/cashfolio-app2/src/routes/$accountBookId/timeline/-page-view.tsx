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
import type { AgChartInstance, AgChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useEffect, useMemo, useRef } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { LinkButton } from "@/components/link-button";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import { TopPageHeader } from "@/components/top-page-header";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import { isTimelinePeriodMode, type TimelinePeriodMode } from "./-page-types";
import {
  createTimelineChartOptions,
  getDefaultRangeButtonLabel,
  mapTimelinePointsToChartData,
} from "./-chart-options";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();

export type TimelinePageViewProps = {
  accountBookId: string;
  selectedMode: TimelinePeriodMode;
  timeline: PeriodTimelineResponse;
  onModeChange: (mode: TimelinePeriodMode) => void;
};

export function TimelinePageView({
  accountBookId,
  selectedMode,
  timeline,
  onModeChange,
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
      new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: activeReferenceCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
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
  const chartRef = useRef<AgChartInstance<AgChartOptions> | null>(null);
  const appliedDefaultRangeModeRef = useRef<TimelinePeriodMode | null>(null);
  const defaultRangeButtonLabel = useMemo(
    () => getDefaultRangeButtonLabel(selectedMode),
    [selectedMode],
  );

  const chartOptions = useMemo(
    () =>
      createTimelineChartOptions({
        chartData,
        periodMode: selectedMode,
        amountCompactFormatter,
        currencyFormatter,
        colors,
        theme,
        isDarkMode,
      }),
    [
      amountCompactFormatter,
      chartData,
      colors,
      currencyFormatter,
      selectedMode,
      isDarkMode,
      theme,
    ],
  );

  useEffect(() => {
    if (chartData.length === 0) {
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

      const rangeButtons = Array.from(
        chartElement.querySelectorAll<HTMLElement>(
          ".ag-charts-range-buttons--buttons .ag-charts-toolbar__button",
        ),
      );

      const matchingButton = rangeButtons.find((button) => {
        const label = button
          .querySelector(".ag-charts-toolbar__label")
          ?.textContent?.trim();
        return label === defaultRangeButtonLabel;
      });

      if (matchingButton) {
        matchingButton.click();
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
  }, [chartData, defaultRangeButtonLabel, selectedMode]);

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
        <Stack gap={4}>
          <Text fw={600}>Total Return by Period</Text>
          <Text c="dimmed" size="sm">
            Amounts shown in {activeReferenceCurrency}
          </Text>
        </Stack>

        {chartData.length === 0 ? (
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
