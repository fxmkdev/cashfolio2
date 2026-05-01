export type TimelinePeriodMode = "month" | "year";

export type TimelineSearch = {
  mode?: TimelinePeriodMode;
};

export const DEFAULT_TIMELINE_MODE: TimelinePeriodMode = "month";

export function isTimelinePeriodMode(
  value: unknown,
): value is TimelinePeriodMode {
  return value === "month" || value === "year";
}

export function parseTimelineSearch(
  search: Record<string, unknown>,
): TimelineSearch {
  return {
    mode: isTimelinePeriodMode(search.mode) ? search.mode : undefined,
  };
}

export function getTimelineMode(search: TimelineSearch): TimelinePeriodMode {
  return search.mode ?? DEFAULT_TIMELINE_MODE;
}
