import type { HistoryMetric } from "./-page-types";
import {
  getHistoryMetricValue,
  isAreaHistoryMetric,
  type HistoryChartDatum,
} from "./-chart-data";

export function getAxisDomainForMetric(args: {
  chartData: HistoryChartDatum[];
  selectedMetric: HistoryMetric;
}): { min?: number; max?: number } {
  const values = args.chartData.map((datum) =>
    getHistoryMetricValue(datum, args.selectedMetric),
  );
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return {};
  }

  if (!isAreaHistoryMetric(args.selectedMetric)) {
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
