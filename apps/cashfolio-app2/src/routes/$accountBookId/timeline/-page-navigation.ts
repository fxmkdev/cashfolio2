import {
  DEFAULT_TIMELINE_SCOPE,
  DEFAULT_TIMELINE_METRIC,
  DEFAULT_TIMELINE_MODE,
  type TimelineMetric,
  type TimelinePeriodMode,
} from "./-page-types";
import type { TimelineScopeSelection } from "@/shared/timeline-scope";

type TimelineNavigationSearch = Record<string, unknown>;

export function buildTimelineSearchNavigation(args: {
  mode: TimelinePeriodMode;
  metric: TimelineMetric;
  incomeScope: TimelineScopeSelection;
  expenseScope: TimelineScopeSelection;
}) {
  return {
    replace: true,
    search: (previousSearch: TimelineNavigationSearch) => ({
      ...previousSearch,
      mode: args.mode === DEFAULT_TIMELINE_MODE ? undefined : args.mode,
      metric: args.metric === DEFAULT_TIMELINE_METRIC ? undefined : args.metric,
      incomeScope:
        args.incomeScope === DEFAULT_TIMELINE_SCOPE
          ? undefined
          : args.incomeScope,
      expenseScope:
        args.expenseScope === DEFAULT_TIMELINE_SCOPE
          ? undefined
          : args.expenseScope,
    }),
  } as const;
}
