import { addUtcDays } from "@/shared/date";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "@/shared/period";
import type { PeriodHistoryResponse } from "@/server/period-history";
import type { HistoryMetric, HistoryPeriodMode } from "./-page-types";

export type HistoryChartDatum = {
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
  rollingAverageMetric: number | null;
};

export type HistoryOpeningBalancePoint =
  PeriodHistoryResponse["openingBalancePoint"];

export type HistoryVisibleRange = {
  start?: Date | string | number;
  end?: Date | string | number;
};

const AREA_HISTORY_METRICS = ["assets", "liabilities", "netWorth"] as const;
export type AreaHistoryMetric = (typeof AREA_HISTORY_METRICS)[number];

export function isAreaHistoryMetric(
  metric: HistoryMetric,
): metric is AreaHistoryMetric {
  return (AREA_HISTORY_METRICS as readonly string[]).includes(metric);
}

function toRangeBoundaryTimestamp(
  value: HistoryVisibleRange["start"],
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

export function getHistoryMetricValue(
  datum: HistoryChartDatum,
  metric: HistoryMetric,
): number {
  return datum[metric] ?? 0;
}

function getNetWorthPositiveValue(netWorth: number): number | null {
  return netWorth >= 0 ? netWorth : null;
}

function getNetWorthNegativeValue(netWorth: number): number | null {
  return netWorth < 0 ? netWorth : null;
}

export function rebaseHistoryChartDataCumulativeToVisibleRange(args: {
  chartData: HistoryChartDatum[];
  visibleRangeX: HistoryVisibleRange | null;
  selectedMetric: HistoryMetric;
}): HistoryChartDatum[] {
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

    cumulativeMetric += getHistoryMetricValue(datum, args.selectedMetric);
    return {
      ...datum,
      cumulativeMetric,
    };
  });
}

export function mapHistoryPointsToChartData(
  points: PeriodHistoryResponse["points"],
): HistoryChartDatum[] {
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
        rollingAverageMetric: null,
      },
    ];
  });
}

function getRollingAverageWindowSize(periodMode: HistoryPeriodMode): number {
  return periodMode === "year" ? 5 : 12;
}

export function addRollingAverageMetricToChartData(args: {
  chartData: HistoryChartDatum[];
  selectedMetric: HistoryMetric;
  periodMode: HistoryPeriodMode;
}): HistoryChartDatum[] {
  if (isAreaHistoryMetric(args.selectedMetric)) {
    return args.chartData;
  }

  const windowSize = getRollingAverageWindowSize(args.periodMode);
  const currentPeriodIndex = args.chartData.length - 1;

  return args.chartData.map((datum, index) => {
    if (index === currentPeriodIndex) {
      return {
        ...datum,
        rollingAverageMetric: null,
      };
    }

    const startIndex = Math.max(0, index - windowSize + 1);
    const trailingValues = args.chartData
      .slice(startIndex, index + 1)
      .map((point) => getHistoryMetricValue(point, args.selectedMetric));
    const rollingAverageMetric =
      trailingValues.reduce((sum, value) => sum + value, 0) /
      trailingValues.length;

    return {
      ...datum,
      rollingAverageMetric,
    };
  });
}

export function prependOpeningBalanceChartDatum(args: {
  chartData: HistoryChartDatum[];
  selectedMetric: HistoryMetric;
  openingBalancePoint?: HistoryOpeningBalancePoint | null;
}): HistoryChartDatum[] {
  if (!isAreaHistoryMetric(args.selectedMetric)) {
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

  const openingDatum: HistoryChartDatum = {
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
    rollingAverageMetric: null,
  };

  return [openingDatum, ...args.chartData];
}
