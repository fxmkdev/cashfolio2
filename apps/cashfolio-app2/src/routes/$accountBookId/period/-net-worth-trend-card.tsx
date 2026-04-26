import { Card, Stack, Text, Title } from "@mantine/core";
import type {
  AgCartesianChartOptions,
  AgLineSeriesOptions,
} from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import { buildCommonChartThemeParams } from "./-breakdown-chart-options";
import type { PeriodNetWorthTrendPoint } from "./-net-worth-trend";
import classes from "./-page-view.module.css";

type NetWorthTrendChartDatum = PeriodNetWorthTrendPoint & {
  netWorthLabel: string;
};

export function NetWorthTrendCard(args: {
  trend: PeriodNetWorthTrendPoint[];
  selectedGranularity: "month" | "year";
  referenceCurrency: string;
  colors: DashboardChartThemeColors;
  currencyFormatter: Intl.NumberFormat;
}) {
  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );
  const subtitle =
    args.selectedGranularity === "month"
      ? `Selected month and 5 prior months · Amounts shown in ${args.referenceCurrency}`
      : `Selected year and 4 prior years · Amounts shown in ${args.referenceCurrency}`;
  const chartData = useMemo<NetWorthTrendChartDatum[]>(
    () =>
      args.trend.map((point) => ({
        ...point,
        netWorthLabel: args.currencyFormatter.format(point.netWorth),
      })),
    [args.currencyFormatter, args.trend],
  );

  const lineSeries = useMemo<AgLineSeriesOptions<NetWorthTrendChartDatum>>(
    () => ({
      type: "line",
      xKey: "label",
      yKey: "netWorth",
      yName: "Net Worth",
      marker: {
        enabled: true,
        size: 6,
        itemStyler: ({ datum }) => {
          if ((datum as NetWorthTrendChartDatum).isSelected) {
            return {
              size: 8,
              fill: args.colors.zeroLineColor,
              stroke: args.colors.zeroLineColor,
            };
          }

          return undefined;
        },
      },
      tooltip: {
        renderer: ({ datum }) => {
          const typedDatum = datum as NetWorthTrendChartDatum;
          return {
            heading: typedDatum.label,
            data: [
              {
                label: "Period",
                value: typedDatum.periodValue,
              },
              {
                label: "Net Worth",
                value: typedDatum.netWorthLabel,
              },
            ],
          };
        },
      },
    }),
    [args.colors.zeroLineColor],
  );

  const chartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: chartData,
      height: 360,
      background: {
        visible: false,
      },
      theme: {
        params: buildCommonChartThemeParams(args.colors),
      },
      legend: {
        enabled: false,
      },
      series: [lineSeries],
      axes: {
        x: {
          type: "category",
          label: {
            rotation: args.selectedGranularity === "month" ? -25 : 0,
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
              stroke: args.colors.zeroLineColor,
              strokeWidth: 1,
              lineDash: [5, 5],
            },
          ],
        },
      },
    }),
    [
      amountCompactFormatter,
      args.colors,
      args.selectedGranularity,
      chartData,
      lineSeries,
    ],
  );

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Title order={4}>Net Worth Trend</Title>
        <Text c="dimmed" size="sm">
          {subtitle}
        </Text>
        <div className={classes.chartContainer}>
          <AgCharts options={chartOptions} />
        </div>
      </Stack>
    </Card>
  );
}
