import type { MantineTheme } from "@mantine/core";
import type { AgCartesianChartOptions } from "ag-charts-community";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import type { PeriodTimelineResponse } from "@/server/period-timeline";

export type TimelineChartDatum = {
  periodValue: string;
  periodLabel: string;
  totalReturn: number;
};

export function mapTimelinePointsToChartData(
  points: PeriodTimelineResponse["points"],
): TimelineChartDatum[] {
  return points.map((point) => ({
    periodValue: point.periodValue,
    periodLabel: point.periodLabel,
    totalReturn: point.totalReturn,
  }));
}

export function createTimelineChartOptions(args: {
  chartData: TimelineChartDatum[];
  amountCompactFormatter: Intl.NumberFormat;
  currencyFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  theme: MantineTheme;
  isDarkMode: boolean;
}): AgCartesianChartOptions {
  const positiveFillColor = args.isDarkMode
    ? args.theme.colors.green[5]
    : args.theme.colors.green[6];
  const negativeFillColor = args.isDarkMode
    ? args.theme.colors.red[5]
    : args.theme.colors.red[6];
  const neutralFillColor = args.isDarkMode
    ? args.theme.colors.gray[5]
    : args.theme.colors.gray[6];
  const currentPeriodBandFill = args.isDarkMode
    ? args.theme.colors.gray[7]
    : args.theme.colors.gray[2];
  const currentPeriodBandFillOpacity = args.isDarkMode ? 0.2 : 0.45;
  const currentPeriodLabel = args.chartData.at(-1)?.periodLabel;

  return {
    data: args.chartData,
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
    series: [
      {
        type: "bar",
        xKey: "periodLabel",
        yKey: "totalReturn",
        yName: "Total Return",
        widthRatio: 0.72,
        itemStyler: ({ datum }) => {
          const totalReturn = (datum as TimelineChartDatum).totalReturn;
          const fill =
            totalReturn > 0
              ? positiveFillColor
              : totalReturn < 0
                ? negativeFillColor
                : neutralFillColor;

          return {
            fill,
            stroke: fill,
          };
        },
        tooltip: {
          renderer: ({ datum }) => {
            const point = datum as TimelineChartDatum;
            return {
              heading: point.periodLabel,
              data: [
                {
                  label: "Total Return",
                  value: args.currencyFormatter.format(point.totalReturn),
                },
              ],
            };
          },
        },
      },
    ],
    axes: {
      x: {
        type: "category",
        crossLines: currentPeriodLabel
          ? [
              {
                type: "range",
                range: [currentPeriodLabel, currentPeriodLabel],
                fill: currentPeriodBandFill,
                fillOpacity: currentPeriodBandFillOpacity,
                strokeWidth: 0,
              },
            ]
          : undefined,
        label: {
          rotation: -25,
        },
      },
      y: {
        type: "number",
        label: {
          formatter: ({ value }) =>
            args.amountCompactFormatter.format(Number(value)),
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
  };
}
