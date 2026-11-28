import {
  loadPeriodHistoryPoint,
  type PeriodHistoryPointContext,
} from "./period-history-point.server";
import { loadHistoryOpeningBalancePoint } from "./period-history-opening-balance.server";
import type { HistoryInput } from "./period-history-input";
import type { HistoryMetricScopeFilter } from "./period-history-scopes.server";
import type { HistoryValuationContext } from "./period-history-point-metrics.server";
import { mapWithConcurrencyLimit } from "../../concurrency.server";
import { readPeriodHistoryMetricsBatch } from "../cache/period-history-metrics-cache.server";

const HISTORY_POINT_LOAD_CONCURRENCY = 4;

export function getHistoryMetricScopeFilter(
  data: HistoryInput,
): HistoryMetricScopeFilter | undefined {
  if (data.scopedMetric === "cashFlow" && data.cashFlowScope !== "total") {
    return {
      metric: "cashFlow" as const,
      scope: data.cashFlowScope,
    };
  }
  if (data.scopedMetric === "income" && data.incomeScope !== "total") {
    return {
      metric: "income" as const,
      scope: data.incomeScope,
    };
  }
  if (data.scopedMetric === "expenses" && data.expenseScope !== "total") {
    return {
      metric: "expenses" as const,
      scope: data.expenseScope,
    };
  }
  if (data.scopedMetric === "gainsLosses" && data.gainLossScope !== "total") {
    return {
      metric: "gainsLosses" as const,
      scope: data.gainLossScope,
    };
  }
  if (data.scopedMetric === "netWorth" && data.netWorthScope !== "total") {
    return { metric: "netWorth" as const, scope: data.netWorthScope };
  }
  return undefined;
}

export async function loadHistoryBatchPoints(args: {
  data: HistoryInput;
  context: PeriodHistoryPointContext;
  periodValues: string[];
  nextBefore?: string;
  activeMetricScopeFilter?: HistoryMetricScopeFilter;
}) {
  const { data, context, periodValues, activeMetricScopeFilter } = args;
  const started = performance.now();
  const metrics = await readPeriodHistoryMetricsBatch({
    accountBookId: data.accountBookId,
    periods: periodValues,
    generation: context.revision,
    metricScopeFilter: activeMetricScopeFilter,
  });
  const openingBalancePoint = args.nextBefore
    ? null
    : await loadHistoryOpeningBalancePoint({
        accountBookId: data.accountBookId,
        accountBookStartDate: context.accountBookStartDate,
        referenceCurrency: context.referenceCurrency,
        metricScopeFilter:
          activeMetricScopeFilter?.metric === "netWorth"
            ? activeMetricScopeFilter
            : undefined,
      });

  const valuationContext: HistoryValuationContext = {
    exchangeRateByKey: new Map(),
  };
  const loadedPoints = await mapWithConcurrencyLimit(
    periodValues,
    HISTORY_POINT_LOAD_CONCURRENCY,
    (periodValue) =>
      loadPeriodHistoryPoint({
        accountBookId: data.accountBookId,
        period: periodValue,
        context,
        metricScopeFilter: activeMetricScopeFilter,
        valuationContext,
        locale: data.locale,
        metricsLoader: metrics.load,
      }),
  );

  if (process.env.HISTORY_PERF_LOG === "1")
    console.info("History batch performance", {
      granularity: data.granularity,
      points: periodValues.length,
      batchMs: performance.now() - started,
      ...metrics.stats,
    });

  return { loadedPoints, openingBalancePoint };
}
export type LoadedHistoryBatch = Awaited<
  ReturnType<typeof loadHistoryBatchPoints>
>;
