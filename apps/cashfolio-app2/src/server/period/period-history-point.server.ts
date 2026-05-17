import { normalizePeriodValue } from "../../shared/period";
import { resolvePeriodSelection } from "./period-selection";
import {
  loadPeriodHistoryPointContext,
  type PeriodHistoryPointContext,
} from "./period-history-point-context.server";
import { getOrLoadPeriodHistoryPointMetrics } from "./period-history-metrics-cache";
import type { HistoryValuationContext } from "./period-history-point-metrics.server";
import type {
  HistoryScopeSelection,
  HistoryScopedMetric,
} from "../../shared/history-scope";
import type { UserLocale } from "../../user-locale";

export { loadPeriodHistoryPointContext };
export type { PeriodHistoryPointContext };

export async function loadPeriodHistoryPoint(args: {
  accountBookId: string;
  period?: unknown;
  context?: PeriodHistoryPointContext;
  metricScopeFilter?: {
    metric: HistoryScopedMetric;
    scope: HistoryScopeSelection;
  };
  valuationContext?: HistoryValuationContext;
  locale?: UserLocale;
}) {
  const data = {
    accountBookId: args.accountBookId,
    period: normalizePeriodValue(args.period),
  };

  const context =
    args.context ??
    (await loadPeriodHistoryPointContext({
      accountBookId: data.accountBookId,
    }));

  const selection = resolvePeriodSelection({
    periodValue: data.period,
    now: new Date(),
    firstBookingDate: context.accountBookStartDate,
    locale: args.locale,
  });
  const isBeforeAccountBookStart = selection.to < context.accountBookStartDate;

  if (isBeforeAccountBookStart) {
    return {
      selectedPeriodValue: selection.periodValue,
      selectedPeriodLabel: selection.label,
      selectedPeriodEnd: selection.to,
      totalReturn: 0,
      savings: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      scopeOptions: {
        income: [],
        expenses: [],
        gainsLosses: [],
        assets: [],
        liabilities: [],
      },
      scopedMetricValue: args.metricScopeFilter ? 0 : undefined,
    };
  }

  const metrics = await getOrLoadPeriodHistoryPointMetrics({
    accountBookId: data.accountBookId,
    period: data.period,
    metricScopeFilter: args.metricScopeFilter,
    valuationContext: args.valuationContext,
  });

  return {
    selectedPeriodValue: selection.periodValue,
    selectedPeriodLabel: selection.label,
    selectedPeriodEnd: selection.to,
    ...metrics,
  };
}
