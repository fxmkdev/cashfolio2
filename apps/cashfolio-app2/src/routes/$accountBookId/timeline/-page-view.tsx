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
import { AgCharts } from "ag-charts-react";
import { useMemo } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { LinkButton } from "@/components/link-button";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import { TopPageHeader } from "@/components/top-page-header";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  type TimelinePeriodMode,
  useTimelinePageSessionState,
} from "./-page-session-state";
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
} from "./-chart-options";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();

export type TimelinePageViewProps = {
  accountBookId: string;
  monthTimeline: PeriodTimelineResponse;
  yearTimeline: PeriodTimelineResponse;
};

function isTimelinePeriodMode(value: string): value is TimelinePeriodMode {
  return value === "month" || value === "year";
}

export function TimelinePageView({
  accountBookId,
  monthTimeline,
  yearTimeline,
}: TimelinePageViewProps) {
  const { periodMode, setPeriodMode } =
    useTimelinePageSessionState(accountBookId);
  const activeTimeline = periodMode === "year" ? yearTimeline : monthTimeline;
  const activeReferenceCurrency = activeTimeline.referenceCurrency;
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
    () => mapTimelinePointsToChartData(activeTimeline.points),
    [activeTimeline.points],
  );

  const chartOptions = useMemo(
    () =>
      createTimelineChartOptions({
        chartData,
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
      isDarkMode,
      theme,
    ],
  );

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
              value={periodMode}
              aria-label="Timeline period mode"
              data={[
                { label: "Monthly", value: "month" },
                { label: "Yearly", value: "year" },
              ]}
              onChange={(nextMode) => {
                if (isTimelinePeriodMode(nextMode)) {
                  setPeriodMode(nextMode);
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
            <AgCharts options={chartOptions} className={classes.chart} />
          </div>
        )}
      </Card>
    </Container>
  );
}
