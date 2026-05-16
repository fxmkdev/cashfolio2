import { normalizePeriodValue } from "../../shared/period";
import { resolvePeriodSelection } from "./period-selection";
import {
  loadPeriodTimelinePointContext,
  type PeriodTimelinePointContext,
} from "./period-timeline-point-context.server";
import { getOrLoadPeriodTimelinePointMetrics } from "./period-timeline-metrics-cache";
import type { TimelineValuationContext } from "./period-timeline-point-metrics.server";
import type {
  TimelineScopeSelection,
  TimelineScopedMetric,
} from "../../shared/timeline-scope";
import type { UserLocale } from "../../user-locale";

export { loadPeriodTimelinePointContext };
export type { PeriodTimelinePointContext };

export async function loadPeriodTimelinePoint(args: {
  accountBookId: string;
  period?: unknown;
  context?: PeriodTimelinePointContext;
  metricScopeFilter?: {
    metric: TimelineScopedMetric;
    scope: TimelineScopeSelection;
  };
  valuationContext?: TimelineValuationContext;
  locale?: UserLocale;
}) {
  const data = {
    accountBookId: args.accountBookId,
    period: normalizePeriodValue(args.period),
  };

  const context =
    args.context ??
    (await loadPeriodTimelinePointContext({
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

  const metrics = await getOrLoadPeriodTimelinePointMetrics({
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
