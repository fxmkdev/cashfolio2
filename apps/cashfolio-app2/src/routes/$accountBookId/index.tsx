import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import { IconAlertTriangle, IconListDetails } from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import { getDashboardIncomeExpenseOverview } from "../../server/dashboard";

export const Route = createFileRoute("/$accountBookId/")({
  loader: async ({ params: { accountBookId } }) => {
    return getDashboardIncomeExpenseOverview({ data: { accountBookId } });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { accountBookId } = Route.useParams();
  const overview = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/" });
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

  const chartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: overview.points,
      background: {
        visible: false,
      },
      theme: {
        params: {
          textColor: isDarkMode ? "#fafafa" : "#09090b",
          foregroundColor: isDarkMode ? "#fafafa" : "#09090b",
        },
      },
      legend: {
        position: "bottom",
      },
      series: [
        {
          type: "bar",
          xKey: "monthLabel",
          yKey: "income",
          yName: "Income",
          fill: "#339af0",
          stroke: "#1c7ed6",
        },
        {
          type: "bar",
          xKey: "monthLabel",
          yKey: "expense",
          yName: "Expense",
          fill: "#ff8787",
          stroke: "#f03e3e",
        },
        {
          type: "line",
          xKey: "monthLabel",
          yKey: "net",
          yName: "Net Result",
          stroke: isDarkMode ? "#2dd4bf" : "#0f766e",
          strokeWidth: 3,
          marker: {
            size: 6,
            itemStyler: ({ yValue }) => ({
              fill: Number(yValue) < 0 ? "#fa5252" : "#40c057",
              stroke: Number(yValue) < 0 ? "#fa5252" : "#40c057",
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
              stroke: isDarkMode ? "#adb5bd" : "#868e96",
              strokeWidth: 1,
              lineDash: [5, 5],
            },
          ],
        },
      },
    }),
    [compactNumberFormatter, isDarkMode, overview.points],
  );

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
          <Title order={4}>Income & Expense Overview</Title>
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
              : "No income or expense bookings found in the last 12 months."}
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
