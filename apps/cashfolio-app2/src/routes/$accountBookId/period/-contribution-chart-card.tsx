import { Card, Stack, Text, Title } from "@mantine/core";
import type {
  AgCartesianChartOptions,
  AgWaterfallSeriesItemStylerParams,
  AgWaterfallSeriesOptions,
} from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import classes from "./-page-view.module.css";

type WaterfallDatum = {
  label: string;
  amount: number;
};

type WaterfallTotalDatum = {
  isTotal: boolean;
};

export type ContributionChartStats = {
  income: number;
  expenses: number;
  gainsLosses: number;
};

function isWaterfallTotalDatum(datum: unknown): datum is WaterfallTotalDatum {
  if (typeof datum !== "object" || datum === null || !("isTotal" in datum)) {
    return false;
  }

  return typeof datum.isTotal === "boolean";
}

export function ContributionChartCard(args: {
  gainsLossesLabel: string;
  stats: ContributionChartStats;
  currencyFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  waterfallPalette: {
    positive: string;
    negative: string;
    total: string;
  };
}) {
  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );
  const waterfallData = useMemo<WaterfallDatum[]>(
    () => [
      {
        label: "Income",
        amount: args.stats.income,
      },
      {
        label: "Expenses",
        amount: -args.stats.expenses,
      },
      {
        label: args.gainsLossesLabel,
        amount: args.stats.gainsLosses,
      },
    ],
    [
      args.gainsLossesLabel,
      args.stats.expenses,
      args.stats.gainsLosses,
      args.stats.income,
    ],
  );
  const waterfallAmountByLabel = useMemo<Record<string, number>>(() => {
    const [incomeDatum, expensesDatum, gainsLossesDatum] = waterfallData;
    const savingsAmount = incomeDatum.amount + expensesDatum.amount;
    const totalReturnAmount = savingsAmount + gainsLossesDatum.amount;

    return {
      [incomeDatum.label]: incomeDatum.amount,
      [expensesDatum.label]: expensesDatum.amount,
      [gainsLossesDatum.label]: gainsLossesDatum.amount,
      Savings: savingsAmount,
      "Total Return": totalReturnAmount,
    };
  }, [waterfallData]);
  const waterfallSeries = useMemo<AgWaterfallSeriesOptions<WaterfallDatum>>(
    () => ({
      type: "waterfall",
      xKey: "label",
      yKey: "amount",
      yName: "Amount",
      widthRatio: 0.72,
      totals: [
        {
          totalType: "subtotal",
          index: 1,
          axisLabel: "Savings",
        },
        {
          totalType: "total",
          index: 2,
          axisLabel: "Total Return",
        },
      ],
      item: {
        positive: {
          fill: args.waterfallPalette.positive,
          stroke: args.waterfallPalette.positive,
        },
        negative: {
          fill: args.waterfallPalette.negative,
          stroke: args.waterfallPalette.negative,
        },
      },
      subtotal: {
        fill: args.waterfallPalette.total,
        stroke: args.waterfallPalette.total,
      },
      total: {
        fill: args.waterfallPalette.total,
        stroke: args.waterfallPalette.total,
      },
      itemStyler: (
        params: AgWaterfallSeriesItemStylerParams<WaterfallDatum>,
      ) => {
        if (isWaterfallTotalDatum(params.datum) && params.datum.isTotal) {
          return {
            fill: args.waterfallPalette.total,
            stroke: args.waterfallPalette.total,
          };
        }

        return undefined;
      },
      tooltip: {
        renderer: ({ datum }) => {
          const label = String(datum.label);
          const amount = waterfallAmountByLabel[label] ?? 0;

          return {
            heading: label,
            data: [
              {
                label: "Total",
                value: args.currencyFormatter.format(amount),
              },
            ],
          };
        },
      },
    }),
    [args.currencyFormatter, waterfallAmountByLabel, args.waterfallPalette],
  );
  const waterfallChartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: waterfallData,
      height: 360,
      background: {
        visible: false,
      },
      theme: {
        params: {
          textColor: args.colors.chartTextColor,
          foregroundColor: args.colors.chartTextColor,
          borderColor: args.colors.themeBorderColor,
          tooltipBackgroundColor: args.colors.tooltipBackgroundColor,
          tooltipBorder: true,
          tooltipTextColor: args.colors.tooltipTextColor,
          tooltipSubtleTextColor: args.colors.tooltipSubtleTextColor,
        },
      },
      legend: {
        enabled: false,
      },
      series: [waterfallSeries],
      axes: {
        x: {
          type: "category",
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
    [amountCompactFormatter, args.colors, waterfallData, waterfallSeries],
  );

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Title order={4}>Contribution to Total Return</Title>
        <Text c="dimmed" size="sm">
          How Income, Expenses, and {args.gainsLossesLabel} lead to Total Return
        </Text>
        <div className={classes.chartContainer}>
          <AgCharts options={waterfallChartOptions} />
        </div>
      </Stack>
    </Card>
  );
}
