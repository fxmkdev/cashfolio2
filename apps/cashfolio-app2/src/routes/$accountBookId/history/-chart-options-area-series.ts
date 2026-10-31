import type { AgCartesianChartOptions } from "ag-charts-community";
import type { HistoryChartOptionsArgs } from "./-chart-options-types";
import type { HistorySeriesContext } from "./-chart-options-common";
import type { HistoryChartDatum } from "./-chart-data";
import { DEFAULT_USER_LOCALE } from "@/user-locale";
const defaultPointDateFormatter = new Intl.DateTimeFormat(DEFAULT_USER_LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

export function createHistoryAreaSeries(
  args: HistoryChartOptionsArgs,
  context: HistorySeriesContext,
): NonNullable<AgCartesianChartOptions["series"]> {
  const {
    positiveFillColor,
    negativeFillColor,
    selectedMetricKey,
    flowSeriesLabel,
    periodListeners,
  } = context;
  const getAreaTooltipHeading = (datum: HistoryChartDatum) =>
    (args.pointDateFormatter ?? defaultPointDateFormatter).format(
      datum.periodMetricDate,
    );
  return [
    {
      type: "area" as const,
      xKey: "periodMetricDate",
      yKey: selectedMetricKey,
      yName: flowSeriesLabel,
      listeners: periodListeners,
      stroke:
        selectedMetricKey === "liabilities"
          ? negativeFillColor
          : positiveFillColor,
      fill:
        selectedMetricKey === "liabilities"
          ? negativeFillColor
          : positiveFillColor,
      fillOpacity: 0.4,
      segmentation:
        selectedMetricKey === "netWorth"
          ? {
              key: "y" as const,
              segments: [
                {
                  stop: 0,
                  fill: negativeFillColor,
                  stroke: negativeFillColor,
                },
                {
                  start: 0,
                  fill: positiveFillColor,
                  stroke: positiveFillColor,
                },
              ],
            }
          : undefined,
      marker: {
        enabled: false,
        size: 5,
        fill:
          selectedMetricKey === "liabilities"
            ? negativeFillColor
            : positiveFillColor,
        stroke:
          selectedMetricKey === "liabilities"
            ? negativeFillColor
            : positiveFillColor,
        itemStyler:
          selectedMetricKey === "netWorth"
            ? ({ datum }: { datum: unknown }) => {
                const color =
                  (datum as HistoryChartDatum).netWorth < 0
                    ? negativeFillColor
                    : positiveFillColor;
                return { fill: color, stroke: color };
              }
            : undefined,
      },
      tooltip: {
        renderer: ({ datum }: { datum: unknown }) => {
          const point = datum as HistoryChartDatum;
          const color =
            selectedMetricKey === "liabilities" ||
            (selectedMetricKey === "netWorth" && point.netWorth < 0)
              ? negativeFillColor
              : positiveFillColor;
          return {
            heading: getAreaTooltipHeading(point),
            symbol: { line: { stroke: color } },
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
  ];
}
