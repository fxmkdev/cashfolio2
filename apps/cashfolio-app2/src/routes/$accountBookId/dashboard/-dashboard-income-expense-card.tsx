import {
  Alert,
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import { useMemo } from "react";
import type { getDashboardIncomeExpenseOverview } from "../../../server/dashboard";
import { DASHBOARD_PERIOD_LABEL_BY_PERIOD } from "../../../shared/dashboard-period";
import {
  DASHBOARD_PERIOD_10Y,
  DASHBOARD_PERIOD_12M,
  type DashboardPeriod,
} from "./-dashboard-page-types";
import { getDashboardChartThemeColors } from "../../../shared/dashboard-chart-theme";
import classes from "./-dashboard-page-view.module.css";

export type DashboardIncomeExpenseCardProps = {
  overview: Awaited<ReturnType<typeof getDashboardIncomeExpenseOverview>>;
  selectedPeriod: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
  currencyFormatter: Intl.NumberFormat;
  compactNumberFormatter: Intl.NumberFormat;
};

export function DashboardIncomeExpenseCard({
  overview,
  selectedPeriod,
  onPeriodChange,
  currencyFormatter,
  compactNumberFormatter,
}: DashboardIncomeExpenseCardProps) {
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const colors = useMemo(
    () => getDashboardChartThemeColors({ theme, isDarkMode }),
    [theme, isDarkMode],
  );
  const hasBookings = overview.bookingsCount > 0;
  const hasConvertedBookings = overview.convertedBookingsCount > 0;

  const totals = useMemo(() => {
    const income = overview.points.reduce(
      (sum, point) => sum + point.income,
      0,
    );
    const expense = overview.points.reduce(
      (sum, point) => sum + point.expense,
      0,
    );
    return {
      income,
      expense,
      net: income - expense,
    };
  }, [overview.points]);

  const chartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: overview.points,
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
        position: "bottom",
      },
      series: [
        {
          type: "bar",
          xKey: "bucketLabel",
          yKey: "income",
          yName: "Income",
          fill: colors.incomeFillColor,
          stroke: colors.incomeStrokeColor,
        },
        {
          type: "bar",
          xKey: "bucketLabel",
          yKey: "expense",
          yName: "Expense",
          fill: colors.expenseFillColor,
          stroke: colors.expenseStrokeColor,
        },
        {
          type: "line",
          xKey: "bucketLabel",
          yKey: "net",
          yName: "Net Result",
          stroke: colors.netStrokeColor,
          strokeWidth: 3,
          marker: {
            size: 6,
            itemStyler: ({ yValue }) => ({
              fill:
                Number(yValue) < 0
                  ? colors.negativeMarkerColor
                  : colors.positiveMarkerColor,
              stroke:
                Number(yValue) < 0
                  ? colors.negativeMarkerColor
                  : colors.positiveMarkerColor,
            }),
          },
        },
      ],
      axes: {
        x: {
          type: "category",
          label: {
            rotation: -30,
          },
        },
        y: {
          type: "number",
          label: {
            formatter: ({ value }) =>
              compactNumberFormatter.format(Number(value)),
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
    [colors, compactNumberFormatter, overview.points],
  );

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
          <Title order={4}>Income & Expense Overview</Title>
          <SegmentedControl
            size="xs"
            aria-label="Dashboard period"
            value={selectedPeriod}
            onChange={(value) =>
              onPeriodChange(
                value === DASHBOARD_PERIOD_10Y
                  ? DASHBOARD_PERIOD_10Y
                  : DASHBOARD_PERIOD_12M,
              )
            }
            data={[
              {
                label: DASHBOARD_PERIOD_LABEL_BY_PERIOD[DASHBOARD_PERIOD_12M],
                value: DASHBOARD_PERIOD_12M,
              },
              {
                label: DASHBOARD_PERIOD_LABEL_BY_PERIOD[DASHBOARD_PERIOD_10Y],
                value: DASHBOARD_PERIOD_10Y,
              },
            ]}
          />
        </Group>
        <Text c="dimmed" size="sm">
          {overview.periodLabel} · Amounts shown in {overview.referenceCurrency}
        </Text>
        <Group gap="xl">
          <Text size="sm">
            Income: {currencyFormatter.format(totals.income)}
          </Text>
          <Text size="sm">
            Expense: {currencyFormatter.format(totals.expense)}
          </Text>
          <Text fw={600} size="sm">
            Net: {currencyFormatter.format(totals.net)}
          </Text>
        </Group>
      </Stack>

      {hasConvertedBookings ? (
        <div className={classes.chartContainer}>
          <AgCharts options={chartOptions} />
        </div>
      ) : (
        <Text c="dimmed" mt="md">
          {hasBookings
            ? "Income or expense bookings were found, but none could be converted with the available metadata and rates."
            : overview.noBookingsMessage}
        </Text>
      )}

      {overview.skippedBookingsCount > 0 ? (
        <Alert
          mt="md"
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
          title="Partial data"
        >
          {overview.skippedBookingsCount} booking(s) were skipped because
          required currency or conversion rate information was unavailable.
        </Alert>
      ) : null}
    </Card>
  );
}
