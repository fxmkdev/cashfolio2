import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
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
import { IconAlertTriangle, IconListDetails } from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import { getDashboardIncomeExpenseOverview } from "../../server/dashboard";
import { DASHBOARD_PERIOD_LABEL_BY_PERIOD } from "../../shared/dashboard-period";
import {
  DASHBOARD_PERIOD_10Y,
  DASHBOARD_PERIOD_12M,
  getDashboardPeriod,
  type DashboardPeriod,
  parseDashboardSearch,
} from "./dashboard-page-types";

export const Route = createFileRoute("/$accountBookId/")({
  validateSearch: parseDashboardSearch,
  loaderDeps: ({ search }) => ({
    period: getDashboardPeriod(search),
  }),
  loader: async ({ params: { accountBookId }, deps: { period } }) => {
    return getDashboardIncomeExpenseOverview({
      data: { accountBookId, period },
    });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { accountBookId } = Route.useParams();
  const selectedPeriod = getDashboardPeriod(Route.useSearch());
  const overview = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/" });
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: overview.referenceCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [overview.referenceCurrency],
  );

  const compactNumberFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
    [],
  );

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

  const hasBookings = overview.bookingsCount > 0;
  const hasConvertedBookings = overview.convertedBookingsCount > 0;
  const chartTextColor = isDarkMode ? theme.colors.dark[0] : theme.black;
  const tooltipBackgroundColor = isDarkMode
    ? theme.colors.dark[6]
    : theme.white;
  const tooltipTextColor = isDarkMode ? theme.colors.gray[0] : theme.black;
  const tooltipSubtleTextColor = isDarkMode
    ? theme.colors.gray[3]
    : theme.colors.gray[7];
  const themeBorderColor = isDarkMode
    ? theme.colors.dark[4]
    : theme.colors.gray[3];

  const chartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: overview.points,
      background: {
        visible: false,
      },
      theme: {
        params: {
          textColor: chartTextColor,
          foregroundColor: chartTextColor,
          borderColor: themeBorderColor,
          tooltipBackgroundColor,
          tooltipBorder: true,
          tooltipTextColor,
          tooltipSubtleTextColor,
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
          fill: isDarkMode ? theme.colors.blue[4] : theme.colors.blue[6],
          stroke: isDarkMode ? theme.colors.blue[3] : theme.colors.blue[7],
        },
        {
          type: "bar",
          xKey: "bucketLabel",
          yKey: "expense",
          yName: "Expense",
          fill: isDarkMode ? theme.colors.red[4] : theme.colors.red[3],
          stroke: isDarkMode ? theme.colors.red[3] : theme.colors.red[7],
        },
        {
          type: "line",
          xKey: "bucketLabel",
          yKey: "net",
          yName: "Net Result",
          stroke: isDarkMode ? theme.colors.teal[3] : theme.colors.teal[8],
          strokeWidth: 3,
          marker: {
            size: 6,
            itemStyler: ({ yValue }) => ({
              fill:
                Number(yValue) < 0
                  ? isDarkMode
                    ? theme.colors.red[4]
                    : theme.colors.red[7]
                  : isDarkMode
                    ? theme.colors.green[4]
                    : theme.colors.green[7],
              stroke:
                Number(yValue) < 0
                  ? isDarkMode
                    ? theme.colors.red[4]
                    : theme.colors.red[7]
                  : isDarkMode
                    ? theme.colors.green[4]
                    : theme.colors.green[7],
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
              stroke: isDarkMode ? theme.colors.gray[4] : theme.colors.gray[6],
              strokeWidth: 1,
              lineDash: [5, 5],
            },
          ],
        },
      },
    }),
    [
      chartTextColor,
      compactNumberFormatter,
      isDarkMode,
      overview.points,
      theme,
      tooltipBackgroundColor,
      themeBorderColor,
      tooltipSubtleTextColor,
      tooltipTextColor,
    ],
  );

  function handlePeriodChange(value: string) {
    const nextPeriod: DashboardPeriod =
      value === DASHBOARD_PERIOD_10Y
        ? DASHBOARD_PERIOD_10Y
        : DASHBOARD_PERIOD_12M;

    navigate({
      search:
        nextPeriod === DASHBOARD_PERIOD_10Y
          ? { period: DASHBOARD_PERIOD_10Y }
          : { period: undefined },
    });
  }

  return (
    <Container fluid py="xl" px="xl">
      <Group mb="lg" justify="space-between" align="center" mih={36}>
        <Title order={2}>Dashboard</Title>
        <Button
          variant="default"
          leftSection={<IconListDetails size={16} />}
          onClick={() =>
            navigate({
              to: "/$accountBookId/accounts",
              params: { accountBookId },
              search: {
                tab: "ASSET",
                mode: "active",
              },
            })
          }
        >
          Accounts
        </Button>
      </Group>

      <Card withBorder radius="md" p="lg">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
            <Title order={4}>Income & Expense Overview</Title>
            <SegmentedControl
              size="xs"
              value={selectedPeriod}
              onChange={handlePeriodChange}
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
            {overview.periodLabel} · Amounts shown in{" "}
            {overview.referenceCurrency}
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
          <div style={{ marginTop: 20, height: 420 }}>
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
    </Container>
  );
}
