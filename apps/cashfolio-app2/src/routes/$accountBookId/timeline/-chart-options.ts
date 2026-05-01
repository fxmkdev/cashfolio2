import type { MantineTheme } from "@mantine/core";
import type {
  AgCartesianChartOptions,
  AgRangesButton,
} from "ag-charts-community";
import { subYears } from "date-fns";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "@/shared/period";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import type { TimelinePeriodMode } from "./-page-types";

export type TimelineChartDatum = {
  periodValue: string;
  periodLabel: string;
  periodStart: Date;
  periodEndExclusive: Date;
  totalReturn: number;
};

export function mapTimelinePointsToChartData(
  points: PeriodTimelineResponse["points"],
): TimelineChartDatum[] {
  return points.map((point) => {
    const explicitPeriod = parseExplicitPeriodSelection(point.periodValue);
    if (!explicitPeriod) {
      throw new Error(`Invalid timeline period value: ${point.periodValue}`);
    }

    const { from, toExclusive } = getExplicitPeriodDateRange(explicitPeriod);

    return {
      periodValue: point.periodValue,
      periodLabel: point.periodLabel,
      periodStart: from,
      periodEndExclusive: toExclusive,
      totalReturn: point.totalReturn,
    };
  });
}

function getRangeButtons(periodMode: TimelinePeriodMode): AgRangesButton[] {
  if (periodMode === "year") {
    return [
      { label: "5Y", value: { unit: "year" as const, step: 5 } },
      { label: "3Y", value: { unit: "year" as const, step: 3 } },
      { label: "10Y", value: { unit: "year" as const, step: 10 } },
      { label: "All", value: undefined },
    ];
  }

  return [
    { label: "1Y", value: "year" },
    { label: "6M", value: { unit: "month" as const, step: 6 } },
    { label: "3Y", value: { unit: "year" as const, step: 3 } },
    { label: "All", value: undefined },
  ];
}

function getRangeControlStyles(args: {
  theme: MantineTheme;
  isDarkMode: boolean;
}) {
  const primaryScale = args.theme.colors[args.theme.primaryColor];
  const primaryShade =
    typeof args.theme.primaryShade === "number"
      ? args.theme.primaryShade
      : args.isDarkMode
        ? args.theme.primaryShade.dark
        : args.theme.primaryShade.light;
  const activeFill = primaryScale?.[primaryShade] ?? args.theme.colors.blue[6];
  const activeStroke =
    primaryScale?.[Math.max(0, primaryShade - 1)] ?? args.theme.colors.blue[7];
  const activeText =
    primaryScale?.[Math.min(9, primaryShade + 1)] ?? args.theme.colors.blue[8];

  if (args.isDarkMode) {
    return {
      fill: args.theme.colors.dark[6],
      stroke: args.theme.colors.dark[3],
      textColor: args.theme.colors.gray[2],
      active: {
        fill: activeFill,
        stroke: activeStroke,
        textColor: args.theme.white,
      },
      hover: {
        fill: args.theme.colors.dark[5],
        stroke: args.theme.colors.dark[2],
        textColor: args.theme.white,
      },
      disabled: {
        fill: args.theme.colors.dark[7],
        stroke: args.theme.colors.dark[4],
        textColor: args.theme.colors.gray[6],
      },
    };
  }

  return {
    fill: args.theme.white,
    stroke: args.theme.colors.gray[4],
    textColor: args.theme.colors.gray[7],
    active: {
      fill: primaryScale?.[1] ?? args.theme.colors.blue[1],
      stroke: activeFill,
      textColor: activeText,
    },
    hover: {
      fill: args.theme.colors.gray[0],
      stroke: args.theme.colors.gray[5],
      textColor: args.theme.black,
    },
    disabled: {
      fill: args.theme.colors.gray[1],
      stroke: args.theme.colors.gray[3],
      textColor: args.theme.colors.gray[5],
    },
  };
}

function getDefaultRangeX(args: {
  chartData: TimelineChartDatum[];
  periodMode: TimelinePeriodMode;
}) {
  const latestPeriod = args.chartData.at(-1);
  if (!latestPeriod) {
    return undefined;
  }

  const years = args.periodMode === "year" ? 5 : 1;
  return {
    start: subYears(latestPeriod.periodEndExclusive, years),
    end: latestPeriod.periodEndExclusive,
  };
}

export function createTimelineChartOptions(args: {
  chartData: TimelineChartDatum[];
  periodMode: TimelinePeriodMode;
  amountCompactFormatter: Intl.NumberFormat;
  currencyFormatter: Intl.NumberFormat;
  colors: DashboardChartThemeColors;
  theme: MantineTheme;
  isDarkMode: boolean;
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
  const rangeButtons = getRangeButtons(args.periodMode);
  const rangeControlStyles = getRangeControlStyles(args);
  const defaultRangeX = getDefaultRangeX(args);
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
      enabled: false,
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
    initialState: defaultRangeX
      ? {
          zoom: {
            rangeX: {
              start: {
                __type: "date",
                value: defaultRangeX.start.getTime(),
              },
              end: {
                __type: "date",
                value: defaultRangeX.end.getTime(),
              },
            },
          },
        }
      : undefined,
    series: [
      {
        type: "bar",
        xKey: "periodStart",
        yKey: "totalReturn",
        yName: "Total Return",
        widthRatio: 0.72,
        itemStyler: ({ datum }) => {
          const totalReturn = (datum as TimelineChartDatum).totalReturn;
          const fill =
            totalReturn > 0
              ? positiveFillColor
              : totalReturn < 0
                ? negativeFillColor
                : neutralFillColor;

          return {
            fill,
            stroke: fill,
          };
        },
        tooltip: {
          renderer: ({ datum }) => {
            const point = datum as TimelineChartDatum;
            return {
              heading: point.periodLabel,
              data: [
                {
                  label: "Total Return",
                  value: args.currencyFormatter.format(point.totalReturn),
                },
              ],
            };
          },
        },
      },
    ],
    axes: {
      x: {
        type: "unit-time",
        unit: unitTimeAxisUnit,
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
