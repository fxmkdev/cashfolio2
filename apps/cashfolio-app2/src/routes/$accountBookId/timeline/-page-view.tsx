import {
  Alert,
  Button,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  createTimelineChartOptions,
  mapTimelinePointsToChartData,
} from "./-chart-options";
import {
  clearYearTimelineFetchError,
  finishYearTimelineFetchFailure,
  finishYearTimelineFetchSuccess,
  getDefaultYearTimelineState,
  shouldStartYearTimelineFetch,
  startYearTimelineFetch,
} from "./-year-timeline-state";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();
const EMPTY_TIMELINE_POINTS: PeriodTimelineResponse["points"] = [];

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
  const [yearTimelineState, setYearTimelineState] = useState(
    getDefaultYearTimelineState,
  );
  const yearFetchRequestIdRef = useRef(0);
  const activeTimeline =
    periodMode === "year" ? yearTimelineState.timeline : monthTimeline;
  const activeReferenceCurrency =
    activeTimeline?.referenceCurrency ?? monthTimeline.referenceCurrency;
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

  useEffect(() => {
    yearFetchRequestIdRef.current += 1;
    setYearTimelineState(getDefaultYearTimelineState());
  }, [accountBookId]);

  const fetchYearTimeline = useCallback(async () => {
    let shouldFetch = false;
    setYearTimelineState((previousState) => {
      if (previousState.timeline != null || previousState.isLoading) {
        return previousState;
      }

      shouldFetch = true;
      return startYearTimelineFetch(previousState);
    });

    if (!shouldFetch) {
      return;
    }
    yearFetchRequestIdRef.current += 1;
    const requestId = yearFetchRequestIdRef.current;

    try {
      const yearTimeline = await getPeriodTimeline({
        data: {
          accountBookId,
          granularity: "year",
        },
      });
      setYearTimelineState((previousState) =>
        requestId === yearFetchRequestIdRef.current
          ? finishYearTimelineFetchSuccess({
              state: previousState,
              timeline: yearTimeline,
            })
          : previousState,
      );
    } catch (error) {
      console.error("Unable to load yearly timeline", error);
      setYearTimelineState((previousState) =>
        requestId === yearFetchRequestIdRef.current
          ? finishYearTimelineFetchFailure({
              state: previousState,
              error: "Unable to load yearly timeline. Please try again.",
            })
          : previousState,
      );
    }
  }, [accountBookId]);

  useEffect(() => {
    if (
      !shouldStartYearTimelineFetch({
        periodMode,
        state: yearTimelineState,
      })
    ) {
      return;
    }

    void fetchYearTimeline();
  }, [fetchYearTimeline, periodMode, yearTimelineState]);

  const handleRetryYearTimelineFetch = useCallback(() => {
    setYearTimelineState((previousState) =>
      clearYearTimelineFetchError(previousState),
    );
  }, []);

  const activeTimelinePoints = activeTimeline?.points ?? EMPTY_TIMELINE_POINTS;
  const chartData = useMemo(
    () => mapTimelinePointsToChartData(activeTimelinePoints),
    [activeTimelinePoints],
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
  const showYearTimelineLoading =
    periodMode === "year" &&
    yearTimelineState.timeline == null &&
    yearTimelineState.isLoading;
  const showYearTimelineError =
    periodMode === "year" &&
    yearTimelineState.timeline == null &&
    yearTimelineState.error != null;

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

        {showYearTimelineLoading ? (
          <Text c="dimmed" mt="md">
            Loading yearly timeline...
          </Text>
        ) : showYearTimelineError ? (
          <Alert mt="md" color="red" title="Unable to load yearly timeline">
            <Stack gap="sm">
              <Text size="sm">{yearTimelineState.error}</Text>
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  onClick={handleRetryYearTimelineFetch}
                >
                  Retry
                </Button>
              </Group>
            </Stack>
          </Alert>
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
