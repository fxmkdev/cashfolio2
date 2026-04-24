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

type WaterfallTotal = {
  totalType: "subtotal" | "total";
  index: number;
  axisLabel: string;
};

type WaterfallTotalDatum = {
  isTotal: boolean;
};

export type ContributionChartStats = {
  income: number;
  expenses: number;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
};

export type ContributionWaterfallModel = {
  data: WaterfallDatum[];
  amountByLabel: Record<string, number>;
  totals: WaterfallTotal[];
};

function isWaterfallTotalDatum(datum: unknown): datum is WaterfallTotalDatum {
  if (typeof datum !== "object" || datum === null || !("isTotal" in datum)) {
    return false;
  }

  return typeof datum.isTotal === "boolean";
}

function getGainLossLabel(amount: number): "Gain" | "Loss" {
  return amount >= 0 ? "Gain" : "Loss";
}

function getGainLossTotalLabel(amount: number): "Gains (total)" | "Loss (total)" {
  return amount >= 0 ? "Gains (total)" : "Loss (total)";
}

export function buildContributionWaterfallModel(args: {
  stats: ContributionChartStats;
}): ContributionWaterfallModel {
  const realizedLabel = `Realised ${getGainLossLabel(args.stats.realizedGainLoss)}`;
  const unrealizedLabel = `Unrealised ${getGainLossLabel(args.stats.unrealizedGainLoss)}`;
  const data: WaterfallDatum[] = [
    {
      label: "Income",
      amount: args.stats.income,
    },
    {
      label: "Expenses",
      amount: -args.stats.expenses,
    },
    {
      label: realizedLabel,
      amount: args.stats.realizedGainLoss,
    },
    {
      label: unrealizedLabel,
      amount: args.stats.unrealizedGainLoss,
    },
  ];
  const [incomeDatum, expensesDatum, realizedDatum, unrealizedDatum] = data;
  const savingsAmount = incomeDatum.amount + expensesDatum.amount;
  const gainsLossesAmount = realizedDatum.amount + unrealizedDatum.amount;
  const gainsLossesTotalLabel = getGainLossTotalLabel(gainsLossesAmount);
  const totalReturnAmount = savingsAmount + gainsLossesAmount;

  return {
    data,
    amountByLabel: {
      [incomeDatum.label]: incomeDatum.amount,
      [expensesDatum.label]: expensesDatum.amount,
      [realizedDatum.label]: realizedDatum.amount,
      [unrealizedDatum.label]: unrealizedDatum.amount,
      Savings: savingsAmount,
      [gainsLossesTotalLabel]: gainsLossesAmount,
      "Total Return": totalReturnAmount,
    },
    totals: [
      {
        totalType: "subtotal",
        index: 1,
        axisLabel: "Savings",
      },
      {
        totalType: "subtotal",
        index: 3,
        axisLabel: gainsLossesTotalLabel,
      },
      {
        totalType: "total",
        index: 3,
        axisLabel: "Total Return",
      },
    ],
  };
}

export function ContributionChartCard(args: {
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
  const waterfallModel = useMemo(
    () => buildContributionWaterfallModel({ stats: args.stats }),
    [
      args.stats.expenses,
      args.stats.income,
      args.stats.realizedGainLoss,
      args.stats.unrealizedGainLoss,
    ],
  );
  const waterfallSeries = useMemo<AgWaterfallSeriesOptions<WaterfallDatum>>(
    () => ({
      type: "waterfall",
      xKey: "label",
      yKey: "amount",
      yName: "Amount",
      widthRatio: 0.72,
      totals: waterfallModel.totals,
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
          const amount = waterfallModel.amountByLabel[label] ?? 0;

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
    [args.currencyFormatter, args.waterfallPalette, waterfallModel],
  );
  const waterfallChartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: waterfallModel.data,
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
    [amountCompactFormatter, args.colors, waterfallModel.data, waterfallSeries],
  );

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Title order={4}>Contribution to Total Return</Title>
        <Text c="dimmed" size="sm">
          How Income, Expenses, Realised, and Unrealised lead to Total Return
        </Text>
        <div className={classes.chartContainer}>
          <AgCharts options={waterfallChartOptions} />
        </div>
      </Stack>
    </Card>
  );
}
