import {
  Alert,
  Card,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type {
  AgDonutSeriesOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import { useMemo } from "react";
import type { getDashboardIncomeExpenseOverview } from "../../../server/dashboard";
import { getDashboardChartThemeColors } from "./-dashboard-chart-theme";
import classes from "./-dashboard-page-view.module.css";

type AssetAllocation = Awaited<
  ReturnType<typeof getDashboardIncomeExpenseOverview>
>["assetAllocation"];

type AssetAllocationChartDatum = AssetAllocation["items"][number] & {
  percentageLabel: string;
  amountLabel: string;
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
  const colors = useMemo(
    () => getDashboardChartThemeColors({ theme, isDarkMode }),
    [theme, isDarkMode],
  );
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
        amountLabel: currencyFormatter.format(item.amount),
      })),
    [assetAllocation.items, currencyFormatter, percentageFormatter],
  );
  const totalIncludedAmountLabel = useMemo(
    () => currencyFormatter.format(assetAllocation.totalIncludedAmount),
    [assetAllocation.totalIncludedAmount, currencyFormatter],
  );
  const chartSeries = useMemo<
    AgDonutSeriesOptions<AssetAllocationChartDatum>[]
  >(
    () => [
      {
        type: "donut",
        angleKey: "amount",
        calloutLabelKey: "label",
        sectorLabelKey: "percentageLabel",
        innerRadiusRatio: 0.7,
        outerRadiusRatio: 0.95,
        calloutLabel: {
          minAngle: 10,
        },
        innerLabels: [
          {
            text: totalIncludedAmountLabel,
            color: colors.chartTextColor,
            fontWeight: 600,
            fontSize: 18,
          },
        ],
        tooltip: {
          renderer: ({ datum }) => {
            const item = datum as AssetAllocationChartDatum;

            return {
              heading: item.label,
              data: [
                {
                  label: "Share",
                  value: item.percentageLabel,
                },
                {
                  label: "Amount",
                  value: item.amountLabel,
                },
                {
                  label: "Total",
                  value: totalIncludedAmountLabel,
                },
              ],
            };
          },
        },
      },
    ],
    [colors, totalIncludedAmountLabel],
  );
  const chartOptions = useMemo<AgPolarChartOptions<AssetAllocationChartDatum>>(
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
      series: chartSeries,
    }),
    [chartData, chartSeries, colors],
  );

  return (
    <Card
      withBorder
      radius="md"
      p="lg"
      data-testid="dashboard-asset-allocation-card"
    >
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
