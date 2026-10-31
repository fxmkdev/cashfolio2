import { getOrLoadPeriodBaseData } from "../cache/period-base-data-cache";
import { loadHistoryPointValuations } from "./period-history-point-metrics-valuation.server";
import {
  assembleHistoryPointMetrics,
  createEmptyHistoryPointMetrics,
} from "./period-history-point-metrics-assembly";
import type {
  HistoryPointMetricsInput,
  PeriodHistoryPointMetrics,
  PeriodHistoryPointMetricsResult,
} from "./period-history-point-metrics-types";

export type {
  PeriodHistoryPointMetrics,
  HistoryValuationContext,
  PeriodHistoryPointMetricsResult,
} from "./period-history-point-metrics-types";

export async function loadPeriodHistoryPointMetrics(
  args: HistoryPointMetricsInput,
): Promise<PeriodHistoryPointMetrics> {
  const result = await loadPeriodHistoryPointMetricsWithCacheability(args);
  return result.metrics;
}

export async function loadPeriodHistoryPointMetricsWithCacheability(
  args: HistoryPointMetricsInput,
): Promise<PeriodHistoryPointMetricsResult> {
  const baseData =
    args.baseData ??
    (await getOrLoadPeriodBaseData({
      accountBookId: args.accountBookId,
      period: args.period,
    }));
  if (baseData.selection.isBeforeAccountBookStart)
    return createEmptyHistoryPointMetrics(Boolean(args.metricScopeFilter));
  const valuations = await loadHistoryPointValuations({
    baseData,
    valuationContext: args.valuationContext,
  });
  return assembleHistoryPointMetrics({
    baseData,
    valuations,
    metricScopeFilter: args.metricScopeFilter,
  });
}
