import type { AgCartesianChartOptions } from "ag-charts-community";
import { isAreaHistoryMetric } from "./-chart-data";
import { createHistoryAreaSeries } from "./-chart-options-area-series";
import { createHistoryFlowSeries } from "./-chart-options-flow-series";
import {
  createHistoryCommonOptions,
  createHistorySeriesContext,
} from "./-chart-options-common";
import type { HistoryChartOptionsArgs } from "./-chart-options-types";

export {
  addRollingAverageMetricToChartData,
  mapHistoryPointsToChartData,
  prependOpeningBalanceChartDatum,
  rebaseHistoryChartDataCumulativeToVisibleRange,
  type HistoryChartDatum,
  type HistoryOpeningBalancePoint,
  type HistoryVisibleRange,
} from "./-chart-data";

export function createHistoryChartOptions(
  args: HistoryChartOptionsArgs,
): AgCartesianChartOptions {
  const context = createHistorySeriesContext(args);
  return {
    ...createHistoryCommonOptions(args, context),
    series: isAreaHistoryMetric(args.selectedMetric)
      ? createHistoryAreaSeries(args, context)
      : createHistoryFlowSeries(args, context),
  };
}
