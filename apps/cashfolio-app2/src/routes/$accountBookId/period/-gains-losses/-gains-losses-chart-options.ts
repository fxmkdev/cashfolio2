import type {
  AgBarSeriesOptions,
  AgCartesianChartOptions,
  AgWaterfallSeriesItemStylerParams,
  AgWaterfallSeriesOptions,
  AgWaterfallSeriesTooltipRendererParams,
} from "ag-charts-community";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import { buildCommonChartThemeParams } from "../-breakdown/-breakdown-chart-options";
import type {
  GainsLossesWaterfallDatum,
  GainsLossesWaterfallTotal,
} from "./-gains-losses-waterfall-model";

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function useGainsLossesWaterfallChartOptions(args: {
  chartData: GainsLossesWaterfallDatum[];
  totals: GainsLossesWaterfallTotal[];
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
    totalGainLoss,
    totalAxisLabel,
    colors,
    waterfallPalette,
    currencyFormatter,
    onNodeDoubleClick,
  } = args;
  const safeTotalGainLoss = toFiniteNumber(totalGainLoss);
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
      yName: "Gain / Loss",
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
        if (params.itemType === "total" || params.itemType === "subtotal") {
          return {
            fill: waterfallPalette.total,
            stroke: waterfallPalette.total,
          };
        }

        return undefined;
      },
      tooltip: {
        renderer: (
          params: AgWaterfallSeriesTooltipRendererParams<GainsLossesWaterfallDatum>,
        ) => {
          const { datum, itemType } = params;
          const node = datum as Partial<GainsLossesWaterfallDatum>;
          const isAggregateItem =
            itemType === "total" || itemType === "subtotal";
          const amount = isAggregateItem
            ? safeTotalGainLoss
            : toFiniteNumber(node.totalGainLoss);

          return {
            heading: isAggregateItem
              ? totalAxisLabel
              : String(node.label ?? totalAxisLabel),
            data: [
              {
                label: "Total",
                value: currencyFormatter.format(amount),
              },
            ],
          };
        },
      },
      listeners: {
        seriesNodeDoubleClick: ({ datum }) => {
          const node = datum as Partial<GainsLossesWaterfallDatum>;
          if (
            typeof node.id !== "string" ||
            typeof node.label !== "string" ||
            typeof node.isDrillable !== "boolean"
          ) {
            return;
          }

          onNodeDoubleClick({
            id: node.id,
            label: node.label,
            totalGainLoss: toFiniteNumber(node.totalGainLoss),
            isDrillable: node.isDrillable,
          });
        },
      },
    }),
    [
      currencyFormatter,
      onNodeDoubleClick,
      totalAxisLabel,
      safeTotalGainLoss,
      totals,
      waterfallPalette.negative,
      waterfallPalette.positive,
      waterfallPalette.total,
    ],
  );

  const singleBarSeries = useMemo<
    AgBarSeriesOptions<GainsLossesWaterfallDatum>
  >(
    () => ({
      type: "bar",
      xKey: "label",
      yKey: "totalGainLoss",
      yName: "Gain / Loss",
      widthRatio: 0.72,
      itemStyler: ({ datum }) => {
        const amount = toFiniteNumber(
          (datum as Partial<GainsLossesWaterfallDatum>).totalGainLoss,
        );
        const fill =
          amount >= 0 ? waterfallPalette.positive : waterfallPalette.negative;
        return {
          fill,
          stroke: fill,
        };
      },
      tooltip: {
        renderer: ({ datum }) => {
          const node = datum as Partial<GainsLossesWaterfallDatum>;
          return {
            heading: String(node.label ?? totalAxisLabel),
            data: [
              {
                label: "Total",
                value: currencyFormatter.format(
                  toFiniteNumber(node.totalGainLoss),
                ),
              },
            ],
          };
        },
      },
      listeners: {
        seriesNodeDoubleClick: ({ datum }) => {
          const node = datum as Partial<GainsLossesWaterfallDatum>;
          if (
            typeof node.id !== "string" ||
            typeof node.label !== "string" ||
            typeof node.isDrillable !== "boolean"
          ) {
            return;
          }

          onNodeDoubleClick({
            id: node.id,
            label: node.label,
            totalGainLoss: toFiniteNumber(node.totalGainLoss),
            isDrillable: node.isDrillable,
          });
        },
      },
    }),
    [
      currencyFormatter,
      onNodeDoubleClick,
      totalAxisLabel,
      waterfallPalette.negative,
      waterfallPalette.positive,
    ],
  );

  const chartSeries = useMemo(
    () => (chartData.length === 1 ? [singleBarSeries] : [waterfallSeries]),
    [chartData.length, singleBarSeries, waterfallSeries],
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
      overlays: {
        // Drilldown card shell already handles empty states. Keeping chart
        // overlays disabled prevents false "No data to display" messages when
        // AG Charts misclassifies transitional waterfall states.
        noData: { enabled: false },
        noVisibleSeries: { enabled: false },
      },
      series: chartSeries,
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
    [amountCompactFormatter, chartData, chartSeries, colors],
  );
}
