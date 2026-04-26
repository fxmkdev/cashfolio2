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
import type { AgCartesianChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useEffect, useMemo, useState } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { LinkButton } from "@/components/link-button";
import {
  getPeriodTimeline,
  type PeriodTimelineResponse,
} from "@/server/period-timeline";
import { TopPageHeader } from "@/components/top-page-header";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  type TimelinePeriodMode,
  useTimelinePageSessionState,
} from "./-page-session-state";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();

type TimelineChartDatum = {
  periodValue: string;
  periodLabel: string;
  totalReturn: number;
};

export type TimelinePageViewProps = {
  accountBookId: string;
  monthTimeline: PeriodTimelineResponse;
};

function isTimelinePeriodMode(value: string): value is TimelinePeriodMode {
  return value === "month" || value === "year";
}

export function TimelinePageView({
  accountBookId,
  monthTimeline,
}: TimelinePageViewProps) {
  const { periodMode, setPeriodMode } =
    useTimelinePageSessionState(accountBookId);
  const [yearTimeline, setYearTimeline] =
    useState<PeriodTimelineResponse | null>(null);
  const [isYearTimelineLoading, setIsYearTimelineLoading] = useState(false);
  const [hasAttemptedYearTimelineLoad, setHasAttemptedYearTimelineLoad] =
    useState(false);

  useEffect(() => {
    setYearTimeline(null);
    setIsYearTimelineLoading(false);
    setHasAttemptedYearTimelineLoad(false);
  }, [accountBookId]);

  useEffect(() => {
    if (
      periodMode !== "year" ||
      yearTimeline != null ||
      isYearTimelineLoading ||
      hasAttemptedYearTimelineLoad
    ) {
      return;
    }

    let active = true;
    setIsYearTimelineLoading(true);
    setHasAttemptedYearTimelineLoad(true);

    void getPeriodTimeline({
      data: {
        accountBookId,
        granularity: "year",
      },
    })
      .then((timeline) => {
        if (!active) {
          return;
        }
        setYearTimeline(timeline);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.error("Unable to load yearly timeline.", error);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setIsYearTimelineLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    accountBookId,
    hasAttemptedYearTimelineLoad,
    isYearTimelineLoading,
    periodMode,
    yearTimeline,
  ]);

  const activeTimeline = periodMode === "year" ? yearTimeline : monthTimeline;
  const activeReferenceCurrency =
    activeTimeline?.referenceCurrency ?? monthTimeline.referenceCurrency;
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const colors = useMemo(
    () => getDashboardChartThemeColors({ theme, isDarkMode }),
    [theme, isDarkMode],
  );

  const positiveFillColor = isDarkMode
    ? theme.colors.green[5]
    : theme.colors.green[6];
  const negativeFillColor = isDarkMode
    ? theme.colors.red[5]
    : theme.colors.red[6];
  const neutralFillColor = isDarkMode
    ? theme.colors.gray[5]
    : theme.colors.gray[6];
  const currentPeriodBandFill = isDarkMode
    ? theme.colors.gray[7]
    : theme.colors.gray[2];
  const currentPeriodBandFillOpacity = isDarkMode ? 0.2 : 0.45;

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

  const chartData = useMemo<TimelineChartDatum[]>(
    () =>
      (activeTimeline?.points ?? []).map((point) => ({
        periodValue: point.periodValue,
        periodLabel: point.periodLabel,
        totalReturn: point.totalReturn,
      })),
    [activeTimeline?.points],
  );
  const currentPeriodLabel = chartData.at(-1)?.periodLabel;

  const chartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: chartData,
      background: {
        visible: false,
      },
      theme: {
        params: {
          textColor: colors.chartTextColor,
          foregroundColor: colors.chartTextColor,
          borderColor: colors.themeBorderColor,
          tooltipBackgroundColor: colors.tooltipBackgroundColor,
          tooltipBorder: true,
          tooltipTextColor: colors.tooltipTextColor,
          tooltipSubtleTextColor: colors.tooltipSubtleTextColor,
        },
      },
      legend: {
        enabled: false,
      },
      series: [
        {
          type: "bar",
          xKey: "periodLabel",
          yKey: "totalReturn",
          yName: "Total Return",
          widthRatio: 0.72,
          itemStyler: ({ datum }) => {
            const totalReturn = (datum as TimelineChartDatum).totalReturn;
            const fill =
              totalReturn > 0
                ? positiveFillColor
                : totalReturn < 0
                  ? negativeFillColor
                  : neutralFillColor;

            return {
              fill,
              stroke: fill,
            };
          },
          tooltip: {
            renderer: ({ datum }) => {
              const point = datum as TimelineChartDatum;
              return {
                heading: point.periodLabel,
                data: [
                  {
                    label: "Total Return",
                    value: currencyFormatter.format(point.totalReturn),
                  },
                ],
              };
            },
          },
        },
      ],
      axes: {
        x: {
          type: "category",
          crossLines: currentPeriodLabel
            ? [
                {
                  type: "range",
                  range: [currentPeriodLabel, currentPeriodLabel],
                  fill: currentPeriodBandFill,
                  fillOpacity: currentPeriodBandFillOpacity,
                  strokeWidth: 0,
                },
              ]
            : undefined,
          label: {
            rotation: -25,
          },
        },
        y: {
          type: "number",
          label: {
            formatter: ({ value }) =>
              amountCompactFormatter.format(Number(value)),
          },
          crossLines: [
            {
              type: "line",
              value: 0,
              stroke: colors.zeroLineColor,
              strokeWidth: 1,
              lineDash: [5, 5],
            },
          ],
        },
      },
    }),
    [
      amountCompactFormatter,
      chartData,
      colors,
      currentPeriodBandFill,
      currentPeriodBandFillOpacity,
      currentPeriodLabel,
      currencyFormatter,
      negativeFillColor,
      neutralFillColor,
      positiveFillColor,
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

        {periodMode === "year" &&
        isYearTimelineLoading &&
        yearTimeline == null ? (
          <Text c="dimmed" mt="md">
            Loading yearly timeline...
          </Text>
        ) : periodMode === "year" && yearTimeline == null ? (
          <Text c="dimmed" mt="md">
            Unable to load yearly timeline right now.
          </Text>
        ) : chartData.length === 0 ? (
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
