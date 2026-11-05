import type {
  AgBarSeriesOptions,
  AgCartesianChartOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import { useUserLocale } from "@/user-locale-context";

export type PeriodBreakdownChartDatum = {
  id: string;
  label: string;
  kind: "group" | "account" | "other";
  amount: number;
  percentage: number;
  isDrillable: boolean;
  amountLabel: string;
  percentageLabel: string;
};

export type PeriodBreakdownNodeDatum = PeriodBreakdownChartDatum;
export type PeriodBreakdownChartOptions =
  AgPolarChartOptions<PeriodBreakdownChartDatum> | AgCartesianChartOptions;

export function buildBreakdownTooltipData(
  args: {
    label: string;
    amountLabel: string;
    percentageLabel: string;
  },
  shareLabel = "Share",
) {
  return {
    heading: args.label,
    data: [
      { label: "Amount", value: args.amountLabel },
      { label: shareLabel, value: args.percentageLabel },
    ],
  };
}

export function buildCommonChartThemeParams(colors: DashboardChartThemeColors) {
  return {
    textColor: colors.chartTextColor,
    foregroundColor: colors.chartTextColor,
    borderColor: colors.themeBorderColor,
    tooltipBackgroundColor: colors.tooltipBackgroundColor,
    tooltipBorder: true,
    tooltipTextColor: colors.tooltipTextColor,
    tooltipSubtleTextColor: colors.tooltipSubtleTextColor,
  };
}

export function usePeriodBreakdownChartOptions(args: {
  chartData: PeriodBreakdownChartDatum[];
  colorBySign?: boolean;
  colors: DashboardChartThemeColors;
  onNodeDoubleClick: (datum: PeriodBreakdownNodeDatum, event: Event) => void;
}): AgCartesianChartOptions {
  const { chartData, colorBySign = false, colors, onNodeDoubleClick } = args;
  const userLocale = useUserLocale();
  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(userLocale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [userLocale],
  );

  return useMemo(() => {
    const sortedData = [...chartData].sort((a, b) => b.amount - a.amount);
    const labelById = new Map(
      sortedData.map((datum) => [datum.id, datum.label]),
    );
    return {
      height: Math.max(440, sortedData.length * 40 + 140),
      background: { visible: false },
      theme: { params: buildCommonChartThemeParams(colors) },
      legend: { enabled: !colorBySign, position: "bottom" },
      series: sortedData.map<AgBarSeriesOptions<PeriodBreakdownChartDatum>>(
        (datum) => ({
          type: "bar",
          data: [datum],
          direction: "horizontal",
          grouped: false,
          ...(colorBySign
            ? {
                fill:
                  datum.amount > 0
                    ? colors.positiveMarkerColor
                    : datum.amount < 0
                      ? colors.negativeMarkerColor
                      : colors.zeroLineColor,
                stroke:
                  datum.amount > 0
                    ? colors.positiveMarkerColor
                    : datum.amount < 0
                      ? colors.negativeMarkerColor
                      : colors.zeroLineColor,
              }
            : {}),
          widthRatio: 0.72,
          xKey: "id",
          yKey: "amount",
          yName: datum.label,
          showInLegend: !colorBySign,
          tooltip: {
            renderer: ({ datum }: { datum: PeriodBreakdownChartDatum }) =>
              buildBreakdownTooltipData(
                datum,
                colorBySign ? "Share of Absolute Movement" : "Share",
              ),
          },
          listeners: {
            seriesNodeDoubleClick: ({ datum, event }) =>
              onNodeDoubleClick(datum as PeriodBreakdownChartDatum, event),
          },
        }),
      ),
      axes: {
        y: {
          type: "category",
          reverse: false,
          label: {
            formatter: ({ value }) =>
              labelById.get(String(value)) ?? String(value),
          },
        },
        x: {
          type: "number",
          label: {
            formatter: ({ value }) => amountCompactFormatter.format(value),
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
    };
  }, [
    amountCompactFormatter,
    chartData,
    colorBySign,
    colors,
    onNodeDoubleClick,
  ]);
}
