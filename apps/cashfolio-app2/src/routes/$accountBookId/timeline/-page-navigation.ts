import type { TimelinePeriodMode } from "./-page-types";

type TimelineNavigationSearch = Record<string, unknown>;

export function buildTimelineModeNavigation(mode: TimelinePeriodMode) {
  return {
    replace: true,
    search: (previousSearch: TimelineNavigationSearch) => ({
      ...previousSearch,
      mode,
    }),
  } as const;
}
