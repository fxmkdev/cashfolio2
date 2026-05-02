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
  periodMetricDate: Date;
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  netWorthPositive: number | null;
  netWorthNegative: number | null;
  cumulativeMetric: number;
};

export type TimelineOpeningBalancePoint =
  PeriodTimelineResponse["openingBalancePoint"];

export type TimelineVisibleRange = {
  start?: Date | string | number;
  end?: Date | string | number;
};

const AREA_TIMELINE_METRICS = ["assets", "liabilities", "netWorth"] as const;
type AreaTimelineMetric = (typeof AREA_TIMELINE_METRICS)[number];
type BarTimelineMetric = Exclude<TimelineMetric, AreaTimelineMetric>;

function isAreaTimelineMetric(
  metric: TimelineMetric,
): metric is AreaTimelineMetric {
  return (AREA_TIMELINE_METRICS as readonly string[]).includes(metric);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

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

function getNetWorthPositiveValue(netWorth: number): number | null {
  return netWorth >= 0 ? netWorth : null;
}

function getNetWorthNegativeValue(netWorth: number): number | null {
  return netWorth < 0 ? netWorth : null;
}

function getAxisDomainForMetric(args: {
  chartData: TimelineChartDatum[];
  selectedMetric: TimelineMetric;
}): { min?: number; max?: number } {
  const values = args.chartData.flatMap((datum) => {
    const metricValue = getMetricValue(datum, args.selectedMetric);
    if (isAreaTimelineMetric(args.selectedMetric)) {
      return [metricValue];
    }

    return [metricValue, datum.cumulativeMetric];
  });
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return {};
  }

  let min = Math.min(0, ...finiteValues);
  let max = Math.max(0, ...finiteValues);

  if (min === max) {
    const padding = min === 0 ? 1 : Math.max(1, Math.abs(min) * 0.05);
    min -= padding;
    max += padding;
  }

  return { min, max };
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
  return points.flatMap((point) => {
    const explicitPeriod = parseExplicitPeriodSelection(point.periodValue);
    if (!explicitPeriod) {
      return [];
    }

    const { from, toExclusive } = getExplicitPeriodDateRange(explicitPeriod);
    const parsedPeriodEndDate = new Date(point.periodEndDate);
    const periodMetricDate = Number.isNaN(parsedPeriodEndDate.getTime())
      ? addUtcDays(toExclusive, -1)
      : parsedPeriodEndDate;

    return [
      {
        periodValue: point.periodValue,
        periodLabel: point.periodLabel,
        periodStart: from,
        periodEndExclusive: toExclusive,
        periodMetricDate,
        totalReturn: point.totalReturn,
        savings: point.savings,
        income: point.income,
        expenses: point.expenses,
        gainsLosses: point.gainsLosses,
        assets: point.assets,
        liabilities: point.liabilities,
        netWorth: point.netWorth,
        netWorthPositive: getNetWorthPositiveValue(point.netWorth),
        netWorthNegative: getNetWorthNegativeValue(point.netWorth),
        cumulativeMetric: 0,
      },
    ];
  });
}

export function prependOpeningBalanceChartDatum(args: {
  chartData: TimelineChartDatum[];
  selectedMetric: TimelineMetric;
  openingBalancePoint?: TimelineOpeningBalancePoint | null;
}): TimelineChartDatum[] {
  if (!isAreaTimelineMetric(args.selectedMetric)) {
    return args.chartData;
  }

  if (!args.openingBalancePoint) {
    return args.chartData;
  }

  const openingDate = new Date(args.openingBalancePoint.date);
  if (Number.isNaN(openingDate.getTime())) {
    return args.chartData;
  }

  if (args.chartData.length > 0) {
    const firstPointDate = args.chartData[0].periodStart;
    if (openingDate.getTime() >= firstPointDate.getTime()) {
      return args.chartData;
    }
  }

  const openingDatum: TimelineChartDatum = {
    periodValue: `opening-balance:${openingDate.toISOString().slice(0, 10)}`,
    periodLabel: args.openingBalancePoint.label,
    periodStart: openingDate,
    periodEndExclusive: addUtcDays(openingDate, 1),
    periodMetricDate: openingDate,
    totalReturn: 0,
    savings: 0,
    income: 0,
    expenses: 0,
    gainsLosses: 0,
    assets: args.openingBalancePoint.assets,
    liabilities: args.openingBalancePoint.liabilities,
    netWorth: args.openingBalancePoint.netWorth,
    netWorthPositive: getNetWorthPositiveValue(
      args.openingBalancePoint.netWorth,
    ),
    netWorthNegative: getNetWorthNegativeValue(
      args.openingBalancePoint.netWorth,
    ),
    cumulativeMetric: 0,
  };

  return [openingDatum, ...args.chartData];
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
  const axisDomain = getAxisDomainForMetric({
    chartData: args.chartData,
    selectedMetric: selectedMetricKey,
  });
  const useRegularTimeAxis = isAreaTimelineMetric(selectedMetricKey);
  const unitTimeAxisUnit =
    args.periodMode === "year"
      ? { unit: "year" as const, utc: true }
      : { unit: "month" as const, utc: true };

  const series = isAreaTimelineMetric(selectedMetricKey)
    ? selectedMetricKey === "netWorth"
      ? [
          {
            type: "area" as const,
            xKey: "periodMetricDate",
            yKey: "netWorthPositive",
            yName: selectedMetricLabel,
            stroke: positiveFillColor,
            fill: positiveFillColor,
            fillOpacity: 0.4,
            marker: {
              enabled: false,
            },
            tooltip: {
              renderer: ({ datum }: { datum: unknown }) => {
                const point = datum as TimelineChartDatum;
                return {
                  heading: point.periodLabel,
                  data: [
                    {
                      label: selectedMetricLabel,
                      value: args.currencyFormatter.format(point.netWorth),
                    },
                  ],
                };
              },
            },
          },
          {
            type: "area" as const,
            xKey: "periodMetricDate",
            yKey: "netWorthNegative",
            yName: selectedMetricLabel,
            showInLegend: false,
            stroke: negativeFillColor,
            fill: negativeFillColor,
            fillOpacity: 0.4,
            marker: {
              enabled: false,
            },
            tooltip: {
              renderer: ({ datum }: { datum: unknown }) => {
                const point = datum as TimelineChartDatum;
                return {
                  heading: point.periodLabel,
                  data: [
                    {
                      label: selectedMetricLabel,
                      value: args.currencyFormatter.format(point.netWorth),
                    },
                  ],
                };
              },
            },
          },
        ]
      : [
          {
            type: "area" as const,
            xKey: "periodMetricDate",
            yKey: selectedMetricKey,
            yName: selectedMetricLabel,
            stroke:
              selectedMetricKey === "assets"
                ? positiveFillColor
                : negativeFillColor,
            fill:
              selectedMetricKey === "assets"
                ? positiveFillColor
                : negativeFillColor,
            fillOpacity: 0.4,
            marker: {
              enabled: false,
            },
            tooltip: {
              renderer: ({ datum }: { datum: unknown }) => {
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
        ]
    : [
        {
          type: "bar" as const,
          xKey: "periodStart",
          yKey: selectedMetricKey as BarTimelineMetric,
          yName: selectedMetricLabel,
          widthRatio: 0.72,
          itemStyler: ({ datum }: { datum: unknown }) => {
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
            renderer: ({ datum }: { datum: unknown }) => {
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
          type: "line" as const,
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
            renderer: ({ datum }: { datum: unknown }) => {
              const point = datum as TimelineChartDatum;
              return {
                heading: point.periodLabel,
                data: [
                  {
                    label: cumulativeMetricLabel,
                    value: args.currencyFormatter.format(
                      point.cumulativeMetric,
                    ),
                  },
                ],
              };
            },
          },
        },
      ];

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
    series,
    axes: {
      x: {
        type: useRegularTimeAxis ? ("time" as const) : ("unit-time" as const),
        unit: useRegularTimeAxis ? undefined : unitTimeAxisUnit,
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
        min: axisDomain.min,
        max: axisDomain.max,
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
