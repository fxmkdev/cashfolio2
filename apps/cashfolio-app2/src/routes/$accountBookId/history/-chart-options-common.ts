import type { AgCartesianChartOptions } from "ag-charts-community";
import type { HistoryChartOptionsArgs } from "./-chart-options-types";
import { isAreaHistoryMetric, type HistoryChartDatum } from "./-chart-data";
import { getHistoryMetricLabel } from "./-page-types";
import { getAxisDomainForMetric } from "./-chart-options-axis-domain";
import {
  getHistoryRangeButtons,
  getHistoryRangeControlStyles,
} from "./-range-controls";
import { parseExplicitPeriodSelection } from "@/shared/period";

export function createHistorySeriesContext(args: HistoryChartOptionsArgs) {
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
  const rollingAverageStrokeColor = args.isDarkMode
    ? (args.theme.colors.cyan?.[4] ?? args.theme.colors.blue[3])
    : (args.theme.colors.cyan?.[7] ?? args.theme.colors.blue[8]);
  const rollingAverageMarkerFillColor = args.isDarkMode
    ? (args.theme.colors.cyan?.[3] ?? args.theme.colors.blue[2])
    : (args.theme.colors.cyan?.[6] ?? args.theme.colors.blue[7]);
  const selectedMetricLabel = getHistoryMetricLabel(args.selectedMetric);
  const flowSeriesLabel = args.selectedMetricSeriesLabel ?? selectedMetricLabel;
  const selectedMetricKey = args.selectedMetric;
  const cumulativeMetricLabel = `Cumulative ${flowSeriesLabel}`;
  const rollingAverageMetricLabel = `${
    args.periodMode === "year" ? "5Y" : "12M"
  } Rolling Avg ${flowSeriesLabel}`;
  const periodListeners = args.onPeriodDoubleClick
    ? {
        seriesNodeDoubleClick: ({ datum }: { datum: unknown }) => {
          const point = datum as HistoryChartDatum;
          if (parseExplicitPeriodSelection(point.periodValue))
            args.onPeriodDoubleClick?.(point.periodValue);
        },
      }
    : undefined;

  return {
    positiveFillColor,
    negativeFillColor,
    neutralFillColor,
    currentPeriodBandFill,
    currentPeriodBandFillOpacity,
    rollingAverageStrokeColor,
    rollingAverageMarkerFillColor,
    selectedMetricKey,
    flowSeriesLabel,
    cumulativeMetricLabel,
    rollingAverageMetricLabel,
    periodListeners,
  };
}
export type HistorySeriesContext = ReturnType<
  typeof createHistorySeriesContext
>;

export function createHistoryCommonOptions(
  args: HistoryChartOptionsArgs,
  context: HistorySeriesContext,
): AgCartesianChartOptions {
  const {
    selectedMetricKey,
    currentPeriodBandFill,
    currentPeriodBandFillOpacity,
  } = context;
  const currentPeriod = args.chartData.at(-1);
  const lastMetricDate = args.chartData.at(-1)?.periodMetricDate;
  const rangeButtons = getHistoryRangeButtons(args.periodMode);
  const rangeControlStyles = getHistoryRangeControlStyles(args);
  const axisDomain = getAxisDomainForMetric({
    chartData: args.chartData,
    selectedMetric: selectedMetricKey,
  });
  const useRegularTimeAxis = isAreaHistoryMetric(selectedMetricKey);
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
      enabled: !isAreaHistoryMetric(selectedMetricKey),
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
    listeners:
      args.onZoom || args.onSeriesVisibilityChange
        ? {
            zoom: args.onZoom,
            seriesVisibilityChange: args.onSeriesVisibilityChange,
          }
        : undefined,
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
          formatter: ({ value }) => args.amountCompactFormatter.format(value),
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
