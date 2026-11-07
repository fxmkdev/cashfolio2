import { useMemo } from "react";
import type { AgPolarChartOptions } from "ag-charts-community";
import type { DashboardChartThemeColors } from "@/components/charts/dashboard-chart-theme";
import {
  buildBreakdownTooltipData,
  buildCommonChartThemeParams,
  type PeriodBreakdownChartDatum,
} from "./-breakdown-chart-options";

export function useAllocationChartOptions(args: {
  chartData: PeriodBreakdownChartDatum[];
  colors: DashboardChartThemeColors;
  totalAmountLabel: string;
  onNodeDoubleClick: (datum: PeriodBreakdownChartDatum, event: Event) => void;
}): AgPolarChartOptions<PeriodBreakdownChartDatum> {
  const { chartData, colors, totalAmountLabel, onNodeDoubleClick } = args;
  return useMemo(
    () => ({
      data: chartData,
      height: 440,
      background: { visible: false },
      theme: { params: buildCommonChartThemeParams(colors) },
      legend: { position: "bottom" },
      series: [
        {
          type: "donut",
          angleKey: "amount",
          calloutLabelKey: "label",
          sectorLabelKey: "percentageLabel",
          innerRadiusRatio: 0.7,
          outerRadiusRatio: 0.95,
          calloutLabel: { minAngle: 10 },
          innerLabels: [
            {
              text: totalAmountLabel,
              color: colors.chartTextColor,
              fontWeight: 600,
              fontSize: 18,
            },
          ],
          tooltip: {
            renderer: ({ datum }) => buildBreakdownTooltipData(datum),
          },
          listeners: {
            seriesNodeDoubleClick: ({ datum, event }) =>
              onNodeDoubleClick(datum, event),
          },
        },
      ],
    }),
    [chartData, colors, totalAmountLabel, onNodeDoubleClick],
  );
}
