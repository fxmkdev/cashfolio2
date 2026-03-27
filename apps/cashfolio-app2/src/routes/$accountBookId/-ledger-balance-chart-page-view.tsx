import {
  Badge,
  Breadcrumbs,
  Card,
  Container,
  Group,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import { useMemo, type ReactNode } from "react";
import { getAccountsBreadcrumbSegments } from "../../components/accounts-breadcrumb-segments";
import { getTypeLabel } from "../../shared/account-utils";
import type { TabValue } from "./-accounts-page-types";
import type { LedgerBalanceChartPoint } from "./-ledger-page-data";
import type { loadLedgerPageData } from "./-ledger-page-loader";
import classes from "./-ledger-balance-chart-page-view.module.css";

type LedgerPageLoaderData = Awaited<ReturnType<typeof loadLedgerPageData>>;

export type LedgerBalanceChartPageViewProps = {
  accountBookId: string;
  backTab: TabValue;
  account: LedgerPageLoaderData["account"];
  unitLabel: string | null;
  points: LedgerBalanceChartPoint[];
  formatBalance: (value: number) => string;
  viewSwitcher: ReactNode;
};

export function LedgerBalanceChartPageView({
  accountBookId,
  backTab,
  account,
  unitLabel,
  points,
  formatBalance,
  viewSwitcher,
}: LedgerBalanceChartPageViewProps) {
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";

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
      data: points,
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
        enabled: false,
      },
      series: [
        {
          type: "line",
          xKey: "dateLabel",
          yKey: "balance",
          yName: "Balance",
          stroke: isDarkMode ? theme.colors.teal[3] : theme.colors.teal[8],
          strokeWidth: 3,
          marker: {
            size: 5,
            fill: isDarkMode ? theme.colors.teal[4] : theme.colors.teal[7],
            stroke: isDarkMode ? theme.colors.teal[3] : theme.colors.teal[8],
          },
          tooltip: {
            renderer: ({ datum }) => {
              const point = datum as LedgerBalanceChartPoint;

              return {
                title: point.dateLabel,
                content: formatBalance(point.balance),
              };
            },
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
            formatter: ({ value }) => formatBalance(Number(value)),
          },
        },
      },
    }),
    [
      chartTextColor,
      formatBalance,
      isDarkMode,
      points,
      theme,
      themeBorderColor,
      tooltipBackgroundColor,
      tooltipSubtleTextColor,
      tooltipTextColor,
    ],
  );

  return (
    <Container fluid py="xl" px="xl" className={classes.page}>
      <Group mb="lg" gap="md" justify="space-between">
        <Group gap="md">
          <Breadcrumbs fz="h2" fw={700}>
            {getAccountsBreadcrumbSegments({
              accountBookId,
              tab: backTab,
              mode: account.isActive ? "active" : "archived",
            })}
            <Text fz="inherit" fw="inherit">
              {getTypeLabel(account.type, account.equityAccountSubtype)}
            </Text>
            {account.groupPathSegments.map((segment) => (
              <Text key={segment} fz="inherit" fw="inherit">
                {segment}
              </Text>
            ))}
            <Text fz="inherit" fw="inherit">
              {account.name}
            </Text>
          </Breadcrumbs>
          {unitLabel && (
            <Badge size="lg" color="gray">
              {unitLabel}
            </Badge>
          )}
        </Group>

        <Group gap="sm">{viewSwitcher}</Group>
      </Group>

      <Card withBorder radius="md" p="lg" className={classes.chartCard}>
        <Stack gap="xs">
          <Text fw={600}>Balance</Text>
          <Text c="dimmed" size="sm">
            Daily closing balance{unitLabel ? ` in ${unitLabel}` : ""}
          </Text>
        </Stack>

        {points.length > 0 ? (
          <div className={classes.chartContainer}>
            <AgCharts options={chartOptions} />
          </div>
        ) : (
          <Text c="dimmed" mt="md">
            No bookings available for this account yet.
          </Text>
        )}
      </Card>
    </Container>
  );
}
