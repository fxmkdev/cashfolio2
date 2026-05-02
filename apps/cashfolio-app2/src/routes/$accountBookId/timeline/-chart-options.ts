import type { MantineTheme } from "@mantine/core";
import type { AgCartesianChartOptions, AgZoomEvent } from "ag-charts-community";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "@/shared/period";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import {
  getTimelineMetricLabel,
  type TimelineMetric,
  type TimelinePeriodMode,
} from "./-page-types";
import {
  getTimelineRangeButtons,
  getTimelineRangeControlStyles,
} from "./-range-controls";

export type TimelineChartDatum = {
  periodValue: string;
  periodLabel: string;
  periodStart: Date;
  periodEndExclusive: Date;
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  cumulativeMetric: number;
};

export type TimelineVisibleRange = {
  start?: Date | string | number;
  end?: Date | string | number;
};

function toRangeBoundaryTimestamp(
  value: TimelineVisibleRange["start"],
): number | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function getMetricValue(
  datum: TimelineChartDatum,
  metric: TimelineMetric,
): number {
  return datum[metric] ?? 0;
}

export function rebaseTimelineChartDataCumulativeToVisibleRange(args: {
  chartData: TimelineChartDatum[];
  visibleRangeX: TimelineVisibleRange | null;
  selectedMetric: TimelineMetric;
}): TimelineChartDatum[] {
  if (args.chartData.length === 0) {
    return [];
  }

  const rangeStart = toRangeBoundaryTimestamp(args.visibleRangeX?.start);
  const rangeEnd = toRangeBoundaryTimestamp(args.visibleRangeX?.end);
  const firstVisibleIndex = args.chartData.findIndex((datum) => {
    const periodStartTimestamp = datum.periodStart.getTime();
    const periodEndExclusiveTimestamp = datum.periodEndExclusive.getTime();
    const isAfterStart =
      rangeStart == null || periodEndExclusiveTimestamp > rangeStart;
    const isBeforeEnd = rangeEnd == null || periodStartTimestamp <= rangeEnd;
    return isAfterStart && isBeforeEnd;
  });
  const rebaseStartIndex = firstVisibleIndex >= 0 ? firstVisibleIndex : 0;

  let cumulativeMetric = 0;
  return args.chartData.map((datum, index) => {
    if (index < rebaseStartIndex) {
      return {
        ...datum,
        cumulativeMetric: 0,
      };
    }

    cumulativeMetric += getMetricValue(datum, args.selectedMetric);
    return {
      ...datum,
      cumulativeMetric,
    };
  });
}

export function mapTimelinePointsToChartData(
  points: PeriodTimelineResponse["points"],
): TimelineChartDatum[] {
  const chartDataWithoutCumulative = points.flatMap((point) => {
    const explicitPeriod = parseExplicitPeriodSelection(point.periodValue);
    if (!explicitPeriod) {
      return [];
    }

    const { from, toExclusive } = getExplicitPeriodDateRange(explicitPeriod);

    return [
      {
        periodValue: point.periodValue,
        periodLabel: point.periodLabel,
        periodStart: from,
        periodEndExclusive: toExclusive,
        totalReturn: point.totalReturn,
        savings: point.savings,
        income: point.income,
        expenses: point.expenses,
        gainsLosses: point.gainsLosses,
        cumulativeMetric: 0,
      },
    ];
  });

  return rebaseTimelineChartDataCumulativeToVisibleRange({
    chartData: chartDataWithoutCumulative,
    visibleRangeX: null,
    selectedMetric: "totalReturn",
  });
}

export function createTimelineChartOptions(args: {
  chartData: TimelineChartDatum[];
  periodMode: TimelinePeriodMode;
  selectedMetric: TimelineMetric;
  amountCompactFormatter: Intl.NumberFormat;
  currencyFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  theme: MantineTheme;
  isDarkMode: boolean;
  onZoom?: (event: AgZoomEvent) => void;
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
  const rangeButtons = getTimelineRangeButtons(args.periodMode);
  const rangeControlStyles = getTimelineRangeControlStyles(args);
  const selectedMetricLabel = getTimelineMetricLabel(args.selectedMetric);
  const selectedMetricKey = args.selectedMetric;
  const cumulativeMetricLabel = `Cumulative ${selectedMetricLabel}`;
  const unitTimeAxisUnit =
    args.periodMode === "year"
      ? { unit: "year" as const, utc: true }
      : { unit: "month" as const, utc: true };

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
      enabled: true,
    },
    navigator: {
      enabled: true,
      miniChart: {
        enabled: false,
      },
    },
    ranges: {
      enabled: true,
      buttons: rangeButtons,
      ...rangeControlStyles,
    },
    listeners: args.onZoom
      ? {
          zoom: args.onZoom,
        }
      : undefined,
    series: [
      {
        type: "bar",
        xKey: "periodStart",
        yKey: selectedMetricKey,
        yName: selectedMetricLabel,
        widthRatio: 0.72,
        itemStyler: ({ datum }) => {
          if (args.selectedMetric === "expenses") {
            return {
              fill: negativeFillColor,
              stroke: negativeFillColor,
            };
          }

          const metricValue =
            (datum as TimelineChartDatum)[selectedMetricKey] ?? 0;
          const fill =
            metricValue > 0
              ? positiveFillColor
              : metricValue < 0
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
                  label: selectedMetricLabel,
                  value: args.currencyFormatter.format(
                    point[selectedMetricKey],
                  ),
                },
              ],
            };
          },
        },
      },
      {
        type: "line",
        xKey: "periodStart",
        yKey: "cumulativeMetric",
        yName: cumulativeMetricLabel,
        stroke: args.isDarkMode
          ? args.theme.colors.blue[2]
          : args.theme.colors.blue[7],
        strokeWidth: 3,
        marker: {
          size: 6,
          fill: args.isDarkMode
            ? args.theme.colors.blue[1]
            : args.theme.colors.blue[6],
          stroke: args.isDarkMode
            ? args.theme.colors.blue[2]
            : args.theme.colors.blue[7],
        },
        tooltip: {
          renderer: ({ datum }) => {
            const point = datum as TimelineChartDatum;
            return {
              heading: point.periodLabel,
              data: [
                {
                  label: cumulativeMetricLabel,
                  value: args.currencyFormatter.format(point.cumulativeMetric),
                },
              ],
            };
          },
        },
      },
    ],
    axes: {
      x: {
        type: "unit-time",
        unit: unitTimeAxisUnit,
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
