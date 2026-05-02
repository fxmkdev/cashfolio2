import { addUtcDays } from "@/shared/date";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "@/shared/period";
import type { PeriodTimelineResponse } from "@/server/period-timeline";
import type { TimelineMetric } from "./-page-types";

export type TimelineChartDatum = {
  periodValue: string;
  periodLabel: string;
  periodStart: Date;
  periodEndExclusive: Date;
  periodMetricDate: Date;
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  netWorthPositive: number | null;
  netWorthNegative: number | null;
  cumulativeMetric: number;
};

export type TimelineOpeningBalancePoint =
  PeriodTimelineResponse["openingBalancePoint"];

export type TimelineVisibleRange = {
  start?: Date | string | number;
  end?: Date | string | number;
};

const AREA_TIMELINE_METRICS = ["assets", "liabilities", "netWorth"] as const;
export type AreaTimelineMetric = (typeof AREA_TIMELINE_METRICS)[number];

export function isAreaTimelineMetric(
  metric: TimelineMetric,
): metric is AreaTimelineMetric {
  return (AREA_TIMELINE_METRICS as readonly string[]).includes(metric);
}

function toRangeBoundaryTimestamp(
  value: TimelineVisibleRange["start"],
): number | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

export function getTimelineMetricValue(
  datum: TimelineChartDatum,
  metric: TimelineMetric,
): number {
  return datum[metric] ?? 0;
}

function getNetWorthPositiveValue(netWorth: number): number | null {
  return netWorth >= 0 ? netWorth : null;
}

function getNetWorthNegativeValue(netWorth: number): number | null {
  return netWorth < 0 ? netWorth : null;
}

export function rebaseTimelineChartDataCumulativeToVisibleRange(args: {
  chartData: TimelineChartDatum[];
  visibleRangeX: TimelineVisibleRange | null;
  selectedMetric: TimelineMetric;
}): TimelineChartDatum[] {
  if (args.chartData.length === 0) {
    return [];
  }

  const rangeStart = toRangeBoundaryTimestamp(args.visibleRangeX?.start);
  const rangeEnd = toRangeBoundaryTimestamp(args.visibleRangeX?.end);
  const firstVisibleIndex = args.chartData.findIndex((datum) => {
    const periodStartTimestamp = datum.periodStart.getTime();
    const periodEndExclusiveTimestamp = datum.periodEndExclusive.getTime();
    const isAfterStart =
      rangeStart == null || periodEndExclusiveTimestamp > rangeStart;
    const isBeforeEnd = rangeEnd == null || periodStartTimestamp <= rangeEnd;
    return isAfterStart && isBeforeEnd;
  });
  const rebaseStartIndex = firstVisibleIndex >= 0 ? firstVisibleIndex : 0;

  let cumulativeMetric = 0;
  return args.chartData.map((datum, index) => {
    if (index < rebaseStartIndex) {
      return {
        ...datum,
        cumulativeMetric: 0,
      };
    }

    cumulativeMetric += getTimelineMetricValue(datum, args.selectedMetric);
    return {
      ...datum,
      cumulativeMetric,
    };
  });
}

export function mapTimelinePointsToChartData(
  points: PeriodTimelineResponse["points"],
): TimelineChartDatum[] {
  return points.flatMap((point) => {
    const explicitPeriod = parseExplicitPeriodSelection(point.periodValue);
    if (!explicitPeriod) {
      return [];
    }

    const { from, toExclusive } = getExplicitPeriodDateRange(explicitPeriod);
    const parsedPeriodEndDate = new Date(point.periodEndDate);
    const periodMetricDate = Number.isNaN(parsedPeriodEndDate.getTime())
      ? addUtcDays(toExclusive, -1)
      : parsedPeriodEndDate;

    return [
      {
        periodValue: point.periodValue,
        periodLabel: point.periodLabel,
        periodStart: from,
        periodEndExclusive: toExclusive,
        periodMetricDate,
        totalReturn: point.totalReturn,
        savings: point.savings,
        income: point.income,
        expenses: point.expenses,
        gainsLosses: point.gainsLosses,
        assets: point.assets,
        liabilities: point.liabilities,
        netWorth: point.netWorth,
        netWorthPositive: getNetWorthPositiveValue(point.netWorth),
        netWorthNegative: getNetWorthNegativeValue(point.netWorth),
        cumulativeMetric: 0,
      },
    ];
  });
}

export function prependOpeningBalanceChartDatum(args: {
  chartData: TimelineChartDatum[];
  selectedMetric: TimelineMetric;
  openingBalancePoint?: TimelineOpeningBalancePoint | null;
}): TimelineChartDatum[] {
  if (!isAreaTimelineMetric(args.selectedMetric)) {
    return args.chartData;
  }

  if (!args.openingBalancePoint) {
    return args.chartData;
  }

  const openingDate = new Date(args.openingBalancePoint.date);
  if (Number.isNaN(openingDate.getTime())) {
    return args.chartData;
  }

  if (args.chartData.length > 0) {
    const firstPointMetricDate = args.chartData[0].periodMetricDate;
    if (openingDate.getTime() >= firstPointMetricDate.getTime()) {
      return args.chartData;
    }
  }

  const openingDatum: TimelineChartDatum = {
    periodValue: `opening-balance:${openingDate.toISOString().slice(0, 10)}`,
    periodLabel: args.openingBalancePoint.label,
    periodStart: openingDate,
    periodEndExclusive: addUtcDays(openingDate, 1),
    periodMetricDate: openingDate,
    totalReturn: 0,
    savings: 0,
    income: 0,
    expenses: 0,
    gainsLosses: 0,
    assets: args.openingBalancePoint.assets,
    liabilities: args.openingBalancePoint.liabilities,
    netWorth: args.openingBalancePoint.netWorth,
    netWorthPositive: getNetWorthPositiveValue(
      args.openingBalancePoint.netWorth,
    ),
    netWorthNegative: getNetWorthNegativeValue(
      args.openingBalancePoint.netWorth,
    ),
    cumulativeMetric: 0,
  };

  return [openingDatum, ...args.chartData];
}
