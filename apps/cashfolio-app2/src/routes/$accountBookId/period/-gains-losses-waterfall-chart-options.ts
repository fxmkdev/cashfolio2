import type {
  AgCartesianChartOptions,
  AgWaterfallSeriesItemStylerParams,
  AgWaterfallSeriesOptions,
} from "ag-charts-community";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";

export type GainsLossesBreakdownChartDatum = {
  id: string;
  label: string;
  amount: number;
  isDrillable: boolean;
};

type GainsLossesWaterfallTotalDatum = {
  isTotal: boolean;
};

function isWaterfallTotalDatum(
  datum: unknown,
): datum is GainsLossesWaterfallTotalDatum {
  if (typeof datum !== "object" || datum === null || !("isTotal" in datum)) {
    return false;
  }

  return typeof datum.isTotal === "boolean";
}

function buildCommonChartThemeParams(colors: DashboardChartThemeColors) {
  return {
    textColor: colors.chartTextColor,
    foregroundColor: colors.chartTextColor,
    borderColor: colors.themeBorderColor,
    tooltipBackgroundColor: colors.tooltipBackgroundColor,
    tooltipBorder: true,
    tooltipTextColor: colors.tooltipTextColor,
    tooltipSubtleTextColor: colors.tooltipSubtleTextColor,
  };
}

export function useGainsLossesWaterfallChartOptions(args: {
  chartData: GainsLossesBreakdownChartDatum[];
  colors: DashboardChartThemeColors;
  currencyFormatter: Intl.NumberFormat;
  waterfallPalette: {
    positive: string;
    negative: string;
    total: string;
  };
  totalAxisLabel: string;
  totalAmount: number;
  onNodeDoubleClick: (datum: GainsLossesBreakdownChartDatum) => void;
}): AgCartesianChartOptions {
  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );
  const amountByLabel = useMemo(() => {
    const map = new Map<string, number>();

    for (const datum of args.chartData) {
      map.set(datum.label, datum.amount);
    }
    map.set(args.totalAxisLabel, args.totalAmount);

    return map;
  }, [args.chartData, args.totalAmount, args.totalAxisLabel]);
  const waterfallSeries = useMemo<
    AgWaterfallSeriesOptions<GainsLossesBreakdownChartDatum>
  >(
    () => ({
      type: "waterfall",
      xKey: "label",
      yKey: "amount",
      yName: "Amount",
      widthRatio: 0.72,
      totals:
        args.chartData.length > 0
          ? [
              {
                totalType: "total",
                index: args.chartData.length - 1,
                axisLabel: args.totalAxisLabel,
              },
            ]
          : [],
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
      total: {
        fill: args.waterfallPalette.total,
        stroke: args.waterfallPalette.total,
      },
      itemStyler: (
        params: AgWaterfallSeriesItemStylerParams<GainsLossesBreakdownChartDatum>,
      ) => {
        if (isWaterfallTotalDatum(params.datum) && params.datum.isTotal) {
          return {
            fill: args.waterfallPalette.total,
            stroke: args.waterfallPalette.total,
          };
        }

        return undefined;
      },
      listeners: {
        seriesNodeDoubleClick: ({ datum }) => {
          if (isWaterfallTotalDatum(datum) && datum.isTotal) {
            return;
          }

          args.onNodeDoubleClick(datum as GainsLossesBreakdownChartDatum);
        },
      },
      tooltip: {
        renderer: ({ datum }) => {
          const label = String(datum.label);
          const amount = amountByLabel.get(label) ?? 0;

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
    [
      amountByLabel,
      args.chartData.length,
      args.currencyFormatter,
      args.onNodeDoubleClick,
      args.totalAxisLabel,
      args.waterfallPalette,
    ],
  );

  return useMemo(
    () => ({
      data: args.chartData,
      height: 440,
      background: {
        visible: false,
      },
      theme: {
        params: buildCommonChartThemeParams(args.colors),
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
    [amountCompactFormatter, args.chartData, args.colors, waterfallSeries],
  );
}
