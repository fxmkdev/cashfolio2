import {
  DEFAULT_TIMELINE_METRIC,
  DEFAULT_TIMELINE_MODE,
  type TimelineMetric,
  type TimelinePeriodMode,
} from "./-page-types";

type TimelineNavigationSearch = Record<string, unknown>;

export function buildTimelineSearchNavigation(args: {
  mode: TimelinePeriodMode;
  metric: TimelineMetric;
}) {
  return {
    replace: true,
    search: (previousSearch: TimelineNavigationSearch) => ({
      ...previousSearch,
      mode: args.mode === DEFAULT_TIMELINE_MODE ? undefined : args.mode,
      metric: args.metric === DEFAULT_TIMELINE_METRIC ? undefined : args.metric,
    }),
  } as const;
}
