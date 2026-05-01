import type { MantineTheme } from "@mantine/core";
import type {
  AgCartesianChartOptions,
  AgRangesButton,
} from "ag-charts-community";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "@/shared/period";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import type { TimelinePeriodMode } from "./-page-session-state";

export type TimelineChartDatum = {
  periodValue: string;
  periodLabel: string;
  periodStart: Date;
  periodEndExclusive: Date;
  totalReturn: number;
};

export function mapTimelinePointsToChartData(
  points: PeriodTimelineResponse["points"],
): TimelineChartDatum[] {
  return points.map((point) => {
    const explicitPeriod = parseExplicitPeriodSelection(point.periodValue);
    if (!explicitPeriod) {
      throw new Error(`Invalid timeline period value: ${point.periodValue}`);
    }

    const { from, toExclusive } = getExplicitPeriodDateRange(explicitPeriod);

    return {
      periodValue: point.periodValue,
      periodLabel: point.periodLabel,
      periodStart: from,
      periodEndExclusive: toExclusive,
      totalReturn: point.totalReturn,
    };
  });
}

function getRangeButtons(periodMode: TimelinePeriodMode): AgRangesButton[] {
  if (periodMode === "year") {
    return [
      { label: "3Y", value: { unit: "year" as const, step: 3 } },
      { label: "5Y", value: { unit: "year" as const, step: 5 } },
      { label: "10Y", value: { unit: "year" as const, step: 10 } },
      { label: "All", value: undefined },
    ];
  }

  return [
    { label: "6M", value: { unit: "month" as const, step: 6 } },
    { label: "1Y", value: "year" },
    { label: "3Y", value: { unit: "year" as const, step: 3 } },
    { label: "All", value: undefined },
  ];
}

export function createTimelineChartOptions(args: {
  chartData: TimelineChartDatum[];
  periodMode: TimelinePeriodMode;
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
  const currentPeriod = args.chartData.at(-1);
  const rangeButtons = getRangeButtons(args.periodMode);

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
    navigator: {
      enabled: true,
      miniChart: {
        enabled: true,
      },
    },
    ranges: {
      enabled: true,
      buttons: rangeButtons,
    },
    series: [
      {
        type: "bar",
        xKey: "periodStart",
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
        type: "time",
        crossLines: currentPeriod
          ? [
              {
                type: "range",
                range: [
                  currentPeriod.periodStart,
                  currentPeriod.periodEndExclusive,
                ],
                fill: currentPeriodBandFill,
                fillOpacity: currentPeriodBandFillOpacity,
                strokeWidth: 0,
              },
            ]
          : undefined,
        label: {
          rotation: -25,
          format: args.periodMode === "year" ? "%Y" : "%b %Y",
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
