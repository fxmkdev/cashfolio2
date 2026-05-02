export type TimelinePeriodMode = "month" | "year";
export type TimelineMetric =
  | "totalReturn"
  | "savings"
  | "income"
  | "expenses"
  | "gainsLosses"
  | "assets"
  | "liabilities"
  | "netWorth";

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
    value === "gainsLosses" ||
    value === "assets" ||
    value === "liabilities" ||
    value === "netWorth"
  );
}

export const TIMELINE_METRIC_OPTIONS: Array<{
  value: TimelineMetric;
  label: string;
}> = [
  { value: "totalReturn", label: "Total Return" },
  { value: "savings", label: "Savings" },
  { value: "income", label: "Income" },
  { value: "expenses", label: "Expenses" },
  { value: "gainsLosses", label: "Gain/Loss" },
  { value: "assets", label: "Assets" },
  { value: "liabilities", label: "Liabilities" },
  { value: "netWorth", label: "Net Worth" },
];

export function getTimelineMetricLabel(metric: TimelineMetric): string {
  const matchedMetric = TIMELINE_METRIC_OPTIONS.find(
    (option) => option.value === metric,
  );

  if (matchedMetric) {
    return matchedMetric.label;
  }

  throw new Error(`Unsupported timeline metric: ${metric}`);
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
