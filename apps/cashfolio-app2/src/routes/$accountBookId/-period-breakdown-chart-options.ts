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

type PeriodBreakdownBarSeriesDefinition = {
  key: string;
  label: string;
};

type PeriodBreakdownBarDatum = {
  id: string;
  kind: "group" | "account";
  isDrillable: boolean;
  label: string;
  amountLabel: string;
  percentageLabel: string;
} & Record<string, number | null | string | boolean>;

export type PeriodBreakdownNodeDatum =
  | PeriodBreakdownChartDatum
  | PeriodBreakdownBarDatum;

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

  const barSeriesDefinitions = useMemo<PeriodBreakdownBarSeriesDefinition[]>(
    () =>
      args.chartData.map((item, index) => ({
        key: `amount_${index}`,
        label: item.label,
      })),
    [args.chartData],
  );

  const barChartData = useMemo<PeriodBreakdownBarDatum[]>(
    () =>
      args.chartData.map((item, itemIndex) => {
        const row: PeriodBreakdownBarDatum = {
          id: item.id,
          kind: item.kind,
          isDrillable: item.isDrillable,
          label: item.label,
          amountLabel: item.amountLabel,
          percentageLabel: item.percentageLabel,
        };

        for (const seriesDefinition of barSeriesDefinitions) {
          row[seriesDefinition.key] = null;
        }

        row[barSeriesDefinitions[itemIndex].key] = item.amount;

        return row;
      }),
    [barSeriesDefinitions, args.chartData],
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
      data: barChartData,
      height: 500,
      background: {
        visible: false,
      },
      theme: {
        params: buildCommonChartThemeParams(args.colors),
      },
      legend: {
        enabled: true,
        position: "bottom",
      },
      series: barSeriesDefinitions.map((seriesDefinition) => ({
        type: "bar",
        direction: "vertical",
        grouped: false,
        widthRatio: 0.72,
        xKey: "label",
        yKey: seriesDefinition.key,
        yName: seriesDefinition.label,
        legendItemName: seriesDefinition.label,
        tooltip: {
          renderer: ({ datum }) =>
            buildBreakdownTooltipData(datum as PeriodBreakdownBarDatum),
        },
        listeners: {
          seriesNodeDoubleClick: ({ datum }) => {
            args.onNodeDoubleClick(datum as PeriodBreakdownBarDatum);
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
      barChartData,
      barSeriesDefinitions,
      args.colors,
      args.onNodeDoubleClick,
    ],
  );

  return args.selectedChartType === "donut"
    ? donutChartOptions
    : barChartOptions;
}
