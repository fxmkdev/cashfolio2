import {
  DEFAULT_HISTORY_SCOPE,
  DEFAULT_HISTORY_METRIC,
  DEFAULT_HISTORY_MODE,
  type HistoryMetric,
  type HistoryPeriodMode,
} from "./-page-types";
import type { HistoryScopeSelection } from "@/shared/history-scope";

type HistoryNavigationSearch = Record<string, unknown>;

export function buildHistorySearchNavigation(args: {
  mode: HistoryPeriodMode;
  metric: HistoryMetric;
  incomeScope: HistoryScopeSelection;
  expenseScope: HistoryScopeSelection;
  gainLossScope: HistoryScopeSelection;
  assetScope: HistoryScopeSelection;
  liabilityScope: HistoryScopeSelection;
}) {
  return {
    replace: true,
    search: (previousSearch: HistoryNavigationSearch) => ({
      ...previousSearch,
      mode: args.mode === DEFAULT_HISTORY_MODE ? undefined : args.mode,
      metric: args.metric === DEFAULT_HISTORY_METRIC ? undefined : args.metric,
      incomeScope:
        args.incomeScope === DEFAULT_HISTORY_SCOPE
          ? undefined
          : args.incomeScope,
      expenseScope:
        args.expenseScope === DEFAULT_HISTORY_SCOPE
          ? undefined
          : args.expenseScope,
      gainLossScope:
        args.gainLossScope === DEFAULT_HISTORY_SCOPE
          ? undefined
          : args.gainLossScope,
      assetScope:
        args.assetScope === DEFAULT_HISTORY_SCOPE ? undefined : args.assetScope,
      liabilityScope:
        args.liabilityScope === DEFAULT_HISTORY_SCOPE
          ? undefined
          : args.liabilityScope,
    }),
  } as const;
}
