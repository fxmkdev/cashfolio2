import type { MantineTheme } from "@mantine/core";
import type { AgCartesianChartOptions, AgZoomEvent } from "ag-charts-community";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  getTimelineMetricLabel,
  type TimelineMetric,
  type TimelinePeriodMode,
} from "./-page-types";
import {
  TimelineChartDatum,
  getTimelineMetricValue,
  isAreaTimelineMetric,
} from "./-chart-data";
import {
  getTimelineRangeButtons,
  getTimelineRangeControlStyles,
} from "./-range-controls";

export {
  mapTimelinePointsToChartData,
  prependOpeningBalanceChartDatum,
  rebaseTimelineChartDataCumulativeToVisibleRange,
  type TimelineChartDatum,
  type TimelineOpeningBalancePoint,
  type TimelineVisibleRange,
} from "./-chart-data";

type BarTimelineMetric = Exclude<
  TimelineMetric,
  "assets" | "liabilities" | "netWorth"
>;

const pointDateFormatter = new Intl.DateTimeFormat("en-CH", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

function getAxisDomainForMetric(args: {
  chartData: TimelineChartDatum[];
  selectedMetric: TimelineMetric;
}): { min?: number; max?: number } {
  const values = args.chartData.map((datum) =>
    getTimelineMetricValue(datum, args.selectedMetric),
  );
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return {};
  }

  if (!isAreaTimelineMetric(args.selectedMetric)) {
    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);
    if (min >= 0) {
      return { min: 0 };
    }
    if (max <= 0) {
      return { max: 0 };
    }
    return {};
  }

  let min = Math.min(0, ...finiteValues);
  let max = Math.max(0, ...finiteValues);
  if (min === max && min === 0) {
    min = -1;
    max = 1;
  }

  return { min, max };
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
  const lastMetricDate = args.chartData.at(-1)?.periodMetricDate;
  const rangeButtons = getTimelineRangeButtons(args.periodMode);
  const rangeControlStyles = getTimelineRangeControlStyles(args);
  const selectedMetricLabel = getTimelineMetricLabel(args.selectedMetric);
  const selectedMetricKey = args.selectedMetric;
  const cumulativeMetricLabel = `Cumulative ${selectedMetricLabel}`;
  const getAreaTooltipHeading = (datum: TimelineChartDatum) =>
    pointDateFormatter.format(datum.periodMetricDate);
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
                  heading: getAreaTooltipHeading(point),
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
                  heading: getAreaTooltipHeading(point),
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
                  heading: getAreaTooltipHeading(point),
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
        nice: useRegularTimeAxis ? false : undefined,
        max: useRegularTimeAxis ? lastMetricDate : undefined,
        crossLines: currentPeriod
          ? [
              {
                type: "range",
                range: [
                  currentPeriod.periodStart,
                  useRegularTimeAxis
                    ? currentPeriod.periodMetricDate
                    : currentPeriod.periodEndExclusive,
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
