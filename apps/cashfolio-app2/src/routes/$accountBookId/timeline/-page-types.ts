export type TimelinePeriodMode = "month" | "year";
export type TimelineMetric =
  | "totalReturn"
  | "savings"
  | "income"
  | "expenses"
  | "gainsLosses";

export type TimelineSearch = {
  mode?: TimelinePeriodMode;
  metric?: TimelineMetric;
};

export const DEFAULT_TIMELINE_MODE: TimelinePeriodMode = "month";
export const DEFAULT_TIMELINE_METRIC: TimelineMetric = "totalReturn";

export function isTimelinePeriodMode(
  value: unknown,
): value is TimelinePeriodMode {
  return value === "month" || value === "year";
}

export function isTimelineMetric(value: unknown): value is TimelineMetric {
  return (
    value === "totalReturn" ||
    value === "savings" ||
    value === "income" ||
    value === "expenses" ||
    value === "gainsLosses"
  );
}

export const TIMELINE_METRIC_OPTIONS = [
  { value: "totalReturn", label: "Total Return" },
  { value: "savings", label: "Savings" },
  { value: "income", label: "Income" },
  { value: "expenses", label: "Expenses" },
  { value: "gainsLosses", label: "Gain/Loss" },
] as const satisfies ReadonlyArray<{
  value: TimelineMetric;
  label: string;
}>;

const TIMELINE_METRIC_LABEL_BY_VALUE: Record<TimelineMetric, string> = {
  totalReturn: "Total Return",
  savings: "Savings",
  income: "Income",
  expenses: "Expenses",
  gainsLosses: "Gain/Loss",
};

export function getTimelineMetricLabel(metric: TimelineMetric): string {
  return TIMELINE_METRIC_LABEL_BY_VALUE[metric];
}

export function parseTimelineSearch(
  search: Record<string, unknown>,
): TimelineSearch {
  return {
    mode: isTimelinePeriodMode(search.mode) ? search.mode : undefined,
    metric: isTimelineMetric(search.metric) ? search.metric : undefined,
  };
}

export function getTimelineMode(search: TimelineSearch): TimelinePeriodMode {
  return search.mode ?? DEFAULT_TIMELINE_MODE;
}

export function getTimelineMetric(search: TimelineSearch): TimelineMetric {
  return search.metric ?? DEFAULT_TIMELINE_METRIC;
}
