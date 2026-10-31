import type { AgCartesianChartOptions } from "ag-charts-community";
import type { HistoryChartOptionsArgs } from "./-chart-options-types";
import type { HistorySeriesContext } from "./-chart-options-common";
import type { HistoryChartDatum } from "./-chart-data";
import type { HistoryMetric } from "./-page-types";
type BarHistoryMetric = Exclude<
  HistoryMetric,
  "assets" | "liabilities" | "netWorth"
>;

export function createHistoryFlowSeries(
  args: HistoryChartOptionsArgs,
  context: HistorySeriesContext,
): NonNullable<AgCartesianChartOptions["series"]> {
  const {
    positiveFillColor,
    negativeFillColor,
    neutralFillColor,
    rollingAverageStrokeColor,
    rollingAverageMarkerFillColor,
    selectedMetricKey,
    flowSeriesLabel,
    cumulativeMetricLabel,
    rollingAverageMetricLabel,
    periodListeners,
  } = context;
  return [
    {
      type: "bar" as const,
      xKey: "periodStart",
      yKey: selectedMetricKey as BarHistoryMetric,
      yName: flowSeriesLabel,
      widthRatio: 0.72,
      listeners: periodListeners,
      itemStyler: ({ datum }: { datum: unknown }) => {
        if (args.selectedMetric === "expenses") {
          return {
            fill: negativeFillColor,
            stroke: negativeFillColor,
          };
        }

        const metricValue =
          (datum as HistoryChartDatum)[selectedMetricKey] ?? 0;
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
          const point = datum as HistoryChartDatum;
          return {
            heading: point.periodLabel,
            data: [
              {
                label: flowSeriesLabel,
                value: args.currencyFormatter.format(point[selectedMetricKey]),
              },
            ],
          };
        },
      },
    },
    {
      type: "line" as const,
      xKey: "periodStart",
      yKey: "rollingAverageMetric",
      yName: rollingAverageMetricLabel,
      stroke: rollingAverageStrokeColor,
      strokeWidth: 2,
      lineDash: [6, 4],
      marker: {
        size: 5,
        fill: rollingAverageMarkerFillColor,
        stroke: rollingAverageStrokeColor,
      },
      tooltip: {
        renderer: ({ datum }: { datum: unknown }) => {
          const point = datum as HistoryChartDatum;
          const rollingAverageValue = point.rollingAverageMetric;
          return {
            heading: point.periodLabel,
            data: [
              {
                label: rollingAverageMetricLabel,
                value:
                  rollingAverageValue == null
                    ? "-"
                    : args.currencyFormatter.format(rollingAverageValue),
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
      visible: args.showCumulativeSeries ?? false,
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
          const point = datum as HistoryChartDatum;
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
  ];
}
