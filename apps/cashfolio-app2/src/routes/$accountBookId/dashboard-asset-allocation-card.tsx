import {
  Alert,
  Card,
  Group,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type { AgChartOptions } from "ag-charts-community";
import { useMemo } from "react";
import type { getDashboardIncomeExpenseOverview } from "../../server/dashboard";
import { getDashboardChartThemeColors } from "./dashboard-chart-theme";
import classes from "./-dashboard-page-view.module.css";

type AssetAllocation = Awaited<
  ReturnType<typeof getDashboardIncomeExpenseOverview>
>["assetAllocation"];

type AssetAllocationChartDatum = AssetAllocation["items"][number] & {
  percentageLabel: string;
  chartAngleValue: number;
};

export type DashboardAssetAllocationCardProps = {
  assetAllocation: AssetAllocation;
  currencyFormatter: Intl.NumberFormat;
  percentageFormatter: Intl.NumberFormat;
};

function getAssetAllocationPartialDataNotes(assetAllocation: AssetAllocation) {
  return [
    assetAllocation.skippedMissingReferenceBalanceCount > 0
      ? `${assetAllocation.skippedMissingReferenceBalanceCount} account(s) were skipped because reference-currency balances were unavailable.`
      : null,
    assetAllocation.skippedNonPositiveCount > 0
      ? `${assetAllocation.skippedNonPositiveCount} account(s) with non-positive balances were excluded from allocation.`
      : null,
  ]
    .filter((value): value is string => value != null)
    .join(" ");
}

export function DashboardAssetAllocationCard({
  assetAllocation,
  currencyFormatter,
  percentageFormatter,
}: DashboardAssetAllocationCardProps) {
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const colors = getDashboardChartThemeColors({ theme, isDarkMode });
  const hasItems = assetAllocation.items.length > 0;
  const hasPartialData =
    assetAllocation.skippedMissingReferenceBalanceCount > 0 ||
    assetAllocation.skippedNonPositiveCount > 0;
  const partialDataNotes = getAssetAllocationPartialDataNotes(assetAllocation);

  const chartData = useMemo<AssetAllocationChartDatum[]>(
    () =>
      assetAllocation.items.map((item) => ({
        ...item,
        percentageLabel: `${percentageFormatter.format(item.percentage)}%`,
        chartAngleValue: item.amount > 0 ? item.amount : item.percentage,
      })),
    [assetAllocation.items, percentageFormatter],
  );
  const chartOptions = useMemo<AgChartOptions>(
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
          type: "donut",
          angleKey: "chartAngleValue",
          calloutLabelKey: "label",
          sectorLabelKey: "percentageLabel",
          innerRadiusRatio: 0.6,
        },
      ],
    }),
    [chartData, colors],
  );

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="xs">
        <Title order={4}>Asset Allocation</Title>
        <Text c="dimmed" size="sm">
          Current balances · Amounts shown in{" "}
          {assetAllocation.referenceCurrency}
        </Text>

        {hasItems ? (
          <div className={classes.assetAllocationContent}>
            <div className={classes.assetAllocationChartContainer}>
              <AgCharts options={chartOptions} />
            </div>

            <Stack gap="xs" justify="center">
              {assetAllocation.items.map((item) => (
                <Group key={item.id} justify="space-between" gap="sm">
                  <Text size="sm">
                    {`${item.label} (${percentageFormatter.format(item.percentage)}%)`}
                  </Text>
                  <Text size="sm" fw={500}>
                    {currencyFormatter.format(item.amount)}
                  </Text>
                </Group>
              ))}

              <Group
                justify="space-between"
                mt="xs"
                pt="xs"
                className={classes.assetAllocationTotal}
              >
                <Text fw={600} size="sm">
                  Total included
                </Text>
                <Text fw={600} size="sm">
                  {currencyFormatter.format(
                    assetAllocation.totalIncludedAmount,
                  )}
                </Text>
              </Group>
            </Stack>
          </div>
        ) : (
          <Text c="dimmed" mt="md">
            No positive, convertible asset balances are available for
            allocation.
          </Text>
        )}
      </Stack>

      {hasPartialData ? (
        <Alert
          mt="md"
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
          title="Partial data"
        >
          {partialDataNotes}
        </Alert>
      ) : null}
    </Card>
  );
}
