import type {
  AgCartesianChartOptions,
  AgWaterfallSeriesItemStylerParams,
  AgWaterfallSeriesOptions,
} from "ag-charts-community";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import { buildCommonChartThemeParams } from "./-breakdown-chart-options";
import type {
  GainsLossesWaterfallDatum,
  GainsLossesWaterfallTotal,
} from "./-gains-losses-waterfall-model";

type WaterfallTotalDatum = {
  isTotal: boolean;
};

function isWaterfallTotalDatum(datum: unknown): datum is WaterfallTotalDatum {
  if (typeof datum !== "object" || datum == null || !("isTotal" in datum)) {
    return false;
  }

  return typeof datum.isTotal === "boolean";
}

export function useGainsLossesWaterfallChartOptions(args: {
  chartData: GainsLossesWaterfallDatum[];
  totals: GainsLossesWaterfallTotal[];
  totalRealizedGainLoss: number;
  totalUnrealizedGainLoss: number;
  totalGainLoss: number;
  totalAxisLabel: string;
  colors: DashboardChartThemeColors;
  waterfallPalette: {
    positive: string;
    negative: string;
    total: string;
  };
  currencyFormatter: Intl.NumberFormat;
  onNodeDoubleClick: (datum: GainsLossesWaterfallDatum) => void;
}): AgCartesianChartOptions {
  const {
    chartData,
    totals,
    totalRealizedGainLoss,
    totalUnrealizedGainLoss,
    totalGainLoss,
    totalAxisLabel,
    colors,
    waterfallPalette,
    currencyFormatter,
    onNodeDoubleClick,
  } = args;
  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );

  const waterfallSeries = useMemo<
    AgWaterfallSeriesOptions<GainsLossesWaterfallDatum>
  >(
    () => ({
      type: "waterfall",
      xKey: "label",
      yKey: "totalGainLoss",
      yName: "Total",
      widthRatio: 0.72,
      totals,
      item: {
        positive: {
          fill: waterfallPalette.positive,
          stroke: waterfallPalette.positive,
        },
        negative: {
          fill: waterfallPalette.negative,
          stroke: waterfallPalette.negative,
        },
      },
      subtotal: {
        fill: waterfallPalette.total,
        stroke: waterfallPalette.total,
      },
      total: {
        fill: waterfallPalette.total,
        stroke: waterfallPalette.total,
      },
      itemStyler: (
        params: AgWaterfallSeriesItemStylerParams<GainsLossesWaterfallDatum>,
      ) => {
        if (isWaterfallTotalDatum(params.datum) && params.datum.isTotal) {
          return {
            fill: waterfallPalette.total,
            stroke: waterfallPalette.total,
          };
        }

        return undefined;
      },
      tooltip: {
        renderer: ({ datum }) => {
          if (isWaterfallTotalDatum(datum) && datum.isTotal) {
            return {
              heading: totalAxisLabel,
              data: [
                {
                  label: "Realised",
                  value: currencyFormatter.format(totalRealizedGainLoss),
                },
                {
                  label: "Unrealised",
                  value: currencyFormatter.format(totalUnrealizedGainLoss),
                },
                {
                  label: "Total",
                  value: currencyFormatter.format(totalGainLoss),
                },
              ],
            };
          }

          const node = datum as GainsLossesWaterfallDatum;
          return {
            heading: node.label,
            data: [
              {
                label: "Realised",
                value: currencyFormatter.format(node.realizedGainLoss),
              },
              {
                label: "Unrealised",
                value: currencyFormatter.format(node.unrealizedGainLoss),
              },
              {
                label: "Total",
                value: currencyFormatter.format(node.totalGainLoss),
              },
            ],
          };
        },
      },
      listeners: {
        seriesNodeDoubleClick: ({ datum }) => {
          if (isWaterfallTotalDatum(datum) && datum.isTotal) {
            return;
          }

          onNodeDoubleClick(datum as GainsLossesWaterfallDatum);
        },
      },
    }),
    [
      currencyFormatter,
      onNodeDoubleClick,
      totalAxisLabel,
      totalGainLoss,
      totalRealizedGainLoss,
      totalUnrealizedGainLoss,
      totals,
      waterfallPalette.negative,
      waterfallPalette.positive,
      waterfallPalette.total,
    ],
  );

  return useMemo(
    () => ({
      data: chartData,
      height: 440,
      background: {
        visible: false,
      },
      theme: {
        params: buildCommonChartThemeParams(colors),
      },
      legend: {
        enabled: false,
      },
      series: [waterfallSeries],
      axes: {
        x: {
          type: "category",
          label: {
            rotation: -25,
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
              stroke: colors.zeroLineColor,
              strokeWidth: 1,
              lineDash: [5, 5],
            },
          ],
        },
      },
    }),
    [amountCompactFormatter, chartData, colors, waterfallSeries],
  );
}
