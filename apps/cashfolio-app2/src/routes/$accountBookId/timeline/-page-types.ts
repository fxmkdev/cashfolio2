import {
  isTimelineScopedMetric,
  parseTimelineScopeSelection,
  type TimelineScopeSelection,
  type TimelineScopedMetric,
} from "@/shared/timeline-scope";

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
  incomeScope?: TimelineScopeSelection;
  expenseScope?: TimelineScopeSelection;
  assetScope?: TimelineScopeSelection;
  liabilityScope?: TimelineScopeSelection;
};

export const DEFAULT_TIMELINE_MODE: TimelinePeriodMode = "month";
export const DEFAULT_TIMELINE_METRIC: TimelineMetric = "totalReturn";
export const DEFAULT_TIMELINE_SCOPE: TimelineScopeSelection = "total";

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
    ...("mode" in search
      ? { mode: isTimelinePeriodMode(search.mode) ? search.mode : undefined }
      : {}),
    ...("metric" in search
      ? { metric: isTimelineMetric(search.metric) ? search.metric : undefined }
      : {}),
    ...("incomeScope" in search
      ? { incomeScope: parseTimelineScopeSelection(search.incomeScope) }
      : {}),
    ...("expenseScope" in search
      ? { expenseScope: parseTimelineScopeSelection(search.expenseScope) }
      : {}),
    ...("assetScope" in search
      ? { assetScope: parseTimelineScopeSelection(search.assetScope) }
      : {}),
    ...("liabilityScope" in search
      ? { liabilityScope: parseTimelineScopeSelection(search.liabilityScope) }
      : {}),
  };
}

export function getTimelineMode(search: TimelineSearch): TimelinePeriodMode {
  return search.mode ?? DEFAULT_TIMELINE_MODE;
}

export function getTimelineMetric(search: TimelineSearch): TimelineMetric {
  return search.metric ?? DEFAULT_TIMELINE_METRIC;
}

export function getTimelineScopeForMetric(args: {
  search: TimelineSearch;
  metric: TimelineScopedMetric;
}): TimelineScopeSelection {
  if (args.metric === "income") {
    return args.search.incomeScope ?? DEFAULT_TIMELINE_SCOPE;
  }

  if (args.metric === "expenses") {
    return args.search.expenseScope ?? DEFAULT_TIMELINE_SCOPE;
  }

  if (args.metric === "assets") {
    return args.search.assetScope ?? DEFAULT_TIMELINE_SCOPE;
  }

  return args.search.liabilityScope ?? DEFAULT_TIMELINE_SCOPE;
}

export function getTimelineScopedMetric(
  metric: TimelineMetric,
): TimelineScopedMetric | undefined {
  return isTimelineScopedMetric(metric) ? metric : undefined;
}
