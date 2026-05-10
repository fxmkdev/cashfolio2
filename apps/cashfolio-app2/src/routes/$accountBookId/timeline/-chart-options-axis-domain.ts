import type { TimelineMetric } from "./-page-types";
import {
  getTimelineMetricValue,
  isAreaTimelineMetric,
  type TimelineChartDatum,
} from "./-chart-data";

export function getAxisDomainForMetric(args: {
  chartData: TimelineChartDatum[];
  selectedMetric: TimelineMetric;
}): { min?: number; max?: number } {
  const values = args.chartData.map((datum) =>
    getTimelineMetricValue(datum, args.selectedMetric),
  );
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return {};
  }

  if (!isAreaTimelineMetric(args.selectedMetric)) {
    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);
    if (min >= 0) {
      return { min: 0 };
    }
    if (max <= 0) {
      return { max: 0 };
    }
    return {};
  }

  let min = Math.min(0, ...finiteValues);
  let max = Math.max(0, ...finiteValues);
  if (min === max && min === 0) {
    min = -1;
    max = 1;
  }

  return { min, max };
}
