import type {
  AgCartesianChartOptions,
  AgDonutSeriesOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import { useMemo } from "react";
import type { DashboardChartThemeColors } from "./-dashboard-chart-theme";
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

const BREAKDOWN_PALETTE = [
  { fill: "#5090dc", stroke: "#2f64a8" },
  { fill: "#ffa03a", stroke: "#c06f1d" },
  { fill: "#459d55", stroke: "#2e6f3a" },
  { fill: "#d14a61", stroke: "#923040" },
  { fill: "#8f6aa8", stroke: "#634779" },
  { fill: "#5aa2ae", stroke: "#3b7279" },
  { fill: "#f2cf5b", stroke: "#ba9840" },
  { fill: "#b3bf2f", stroke: "#7f8a1f" },
  { fill: "#f58370", stroke: "#b55e50" },
  { fill: "#9f6f55", stroke: "#704d39" },
] as const;

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
  const colorByDatumId = useMemo(
    () =>
      new Map(
        args.chartData.map((datum, index) => [
          datum.id,
          BREAKDOWN_PALETTE[index % BREAKDOWN_PALETTE.length],
        ]),
      ),
    [args.chartData],
  );
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
        fills: BREAKDOWN_PALETTE.map((color) => color.fill),
        strokes: BREAKDOWN_PALETTE.map((color) => color.stroke),
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
      height: 500,
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
      data: args.chartData,
      height: 500,
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
      series: [
        {
          type: "bar",
          direction: "vertical",
          grouped: false,
          widthRatio: 0.72,
          xKey: "label",
          yKey: "amount",
          yName: "Amount",
          itemStyler: ({ datum }) => {
            const color = colorByDatumId.get(
              (datum as PeriodBreakdownChartDatum).id,
            );
            if (!color) {
              return {};
            }

            return {
              fill: color.fill,
              stroke: color.stroke,
            };
          },
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
      colorByDatumId,
      args.onNodeDoubleClick,
    ],
  );

  return args.selectedChartType === "donut"
    ? donutChartOptions
    : barChartOptions;
}
