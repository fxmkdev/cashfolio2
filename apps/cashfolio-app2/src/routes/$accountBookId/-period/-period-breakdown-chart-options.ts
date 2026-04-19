import type {
  AgCartesianChartOptions,
  AgDonutSeriesOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "../-dashboard/-dashboard-chart-theme";
import type { BreakdownChartType } from "./-period-breakdown-types";

export type PeriodBreakdownChartDatum = {
  id: string;
  label: string;
  kind: "group" | "account";
  amount: number;
  percentage: number;
  isDrillable: boolean;
  amountLabel: string;
  percentageLabel: string;
};

export type PeriodBreakdownNodeDatum = PeriodBreakdownChartDatum;

export type PeriodBreakdownChartOptions =
  | AgPolarChartOptions<PeriodBreakdownChartDatum>
  | AgCartesianChartOptions;

function buildBreakdownTooltipData(args: {
  label: string;
  amountLabel: string;
  percentageLabel: string;
}) {
  return {
    heading: args.label,
    data: [
      {
        label: "Amount",
        value: args.amountLabel,
      },
      {
        label: "Share",
        value: args.percentageLabel,
      },
    ],
  };
}

function buildCommonChartThemeParams(colors: DashboardChartThemeColors) {
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
  selectedChartType: BreakdownChartType;
  colors: DashboardChartThemeColors;
  totalBreakdownAmountLabel: string;
  onNodeDoubleClick: (datum: PeriodBreakdownNodeDatum) => void;
}): PeriodBreakdownChartOptions {
  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );

  const donutSeries = useMemo<
    AgDonutSeriesOptions<PeriodBreakdownChartDatum>[]
  >(
    () => [
      {
        type: "donut",
        angleKey: "amount",
        calloutLabelKey: "label",
        sectorLabelKey: "percentageLabel",
        innerRadiusRatio: 0.7,
        outerRadiusRatio: 0.95,
        calloutLabel: {
          minAngle: 10,
        },
        innerLabels: [
          {
            text: args.totalBreakdownAmountLabel,
            color: args.colors.chartTextColor,
            fontWeight: 600,
            fontSize: 18,
          },
        ],
        tooltip: {
          renderer: ({ datum }) =>
            buildBreakdownTooltipData(datum as PeriodBreakdownChartDatum),
        },
        listeners: {
          seriesNodeDoubleClick: ({ datum }) => {
            args.onNodeDoubleClick(datum as PeriodBreakdownChartDatum);
          },
        },
      },
    ],
    [
      args.colors.chartTextColor,
      args.onNodeDoubleClick,
      args.totalBreakdownAmountLabel,
    ],
  );

  const donutChartOptions = useMemo<
    AgPolarChartOptions<PeriodBreakdownChartDatum>
  >(
    () => ({
      data: args.chartData,
      height: 440,
      background: {
        visible: false,
      },
      theme: {
        params: buildCommonChartThemeParams(args.colors),
      },
      legend: {
        position: "bottom",
      },
      series: donutSeries,
    }),
    [args.chartData, args.colors, donutSeries],
  );

  const barChartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      height: 440,
      background: {
        visible: false,
      },
      theme: {
        params: buildCommonChartThemeParams(args.colors),
      },
      legend: {
        enabled: false,
        position: "bottom",
      },
      series: args.chartData.map((datum) => ({
        type: "bar" as const,
        data: [datum],
        direction: "vertical" as const,
        grouped: false,
        widthRatio: 0.72,
        xKey: "label" as const,
        yKey: "amount" as const,
        yName: "Amount",
        showInLegend: false,
        tooltip: {
          renderer: ({ datum }: { datum: PeriodBreakdownChartDatum }) =>
            buildBreakdownTooltipData(datum),
        },
        listeners: {
          seriesNodeDoubleClick: ({ datum }) => {
            args.onNodeDoubleClick(datum as PeriodBreakdownChartDatum);
          },
        },
      })),
      axes: {
        x: {
          type: "category",
          label: {
            rotation: -25,
          },
        },
        y: {
          type: "number",
          label: {
            formatter: ({ value }) =>
              amountCompactFormatter.format(Number(value)),
          },
        },
      },
    }),
    [
      amountCompactFormatter,
      args.colors,
      args.chartData,
      args.onNodeDoubleClick,
    ],
  );

  return args.selectedChartType === "donut"
    ? donutChartOptions
    : barChartOptions;
}
