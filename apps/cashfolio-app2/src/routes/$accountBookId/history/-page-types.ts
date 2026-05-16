import {
  isHistoryScopedMetric,
  parseHistoryScopeSelection,
  type HistoryScopeSelection,
  type HistoryScopedMetric,
} from "@/shared/history-scope";

export type HistoryPeriodMode = "month" | "year";
export type HistoryMetric =
  | "totalReturn"
  | "savings"
  | "income"
  | "expenses"
  | "gainsLosses"
  | "assets"
  | "liabilities"
  | "netWorth";

export type HistorySearch = {
  mode?: HistoryPeriodMode;
  metric?: HistoryMetric;
  incomeScope?: HistoryScopeSelection;
  expenseScope?: HistoryScopeSelection;
  gainLossScope?: HistoryScopeSelection;
  assetScope?: HistoryScopeSelection;
  liabilityScope?: HistoryScopeSelection;
};

export const DEFAULT_HISTORY_MODE: HistoryPeriodMode = "month";
export const DEFAULT_HISTORY_METRIC: HistoryMetric = "totalReturn";
export const DEFAULT_HISTORY_SCOPE: HistoryScopeSelection = "total";

export function isHistoryPeriodMode(
  value: unknown,
): value is HistoryPeriodMode {
  return value === "month" || value === "year";
}

export function isHistoryMetric(value: unknown): value is HistoryMetric {
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

export const HISTORY_METRIC_OPTIONS: Array<{
  value: HistoryMetric;
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

export function getHistoryMetricLabel(metric: HistoryMetric): string {
  const matchedMetric = HISTORY_METRIC_OPTIONS.find(
    (option) => option.value === metric,
  );

  if (matchedMetric) {
    return matchedMetric.label;
  }

  throw new Error(`Unsupported history metric: ${metric}`);
}

export function parseHistorySearch(
  search: Record<string, unknown>,
): HistorySearch {
  return {
    ...("mode" in search
      ? { mode: isHistoryPeriodMode(search.mode) ? search.mode : undefined }
      : {}),
    ...("metric" in search
      ? { metric: isHistoryMetric(search.metric) ? search.metric : undefined }
      : {}),
    ...("incomeScope" in search
      ? { incomeScope: parseHistoryScopeSelection(search.incomeScope) }
      : {}),
    ...("expenseScope" in search
      ? { expenseScope: parseHistoryScopeSelection(search.expenseScope) }
      : {}),
    ...("gainLossScope" in search
      ? { gainLossScope: parseHistoryScopeSelection(search.gainLossScope) }
      : {}),
    ...("assetScope" in search
      ? { assetScope: parseHistoryScopeSelection(search.assetScope) }
      : {}),
    ...("liabilityScope" in search
      ? { liabilityScope: parseHistoryScopeSelection(search.liabilityScope) }
      : {}),
  };
}

export function getHistoryMode(search: HistorySearch): HistoryPeriodMode {
  return search.mode ?? DEFAULT_HISTORY_MODE;
}

export function getHistoryMetric(search: HistorySearch): HistoryMetric {
  return search.metric ?? DEFAULT_HISTORY_METRIC;
}

export function getHistoryScopeForMetric(args: {
  search: HistorySearch;
  metric: HistoryScopedMetric;
}): HistoryScopeSelection {
  if (args.metric === "income") {
    return args.search.incomeScope ?? DEFAULT_HISTORY_SCOPE;
  }

  if (args.metric === "expenses") {
    return args.search.expenseScope ?? DEFAULT_HISTORY_SCOPE;
  }

  if (args.metric === "gainsLosses") {
    return args.search.gainLossScope ?? DEFAULT_HISTORY_SCOPE;
  }

  if (args.metric === "assets") {
    return args.search.assetScope ?? DEFAULT_HISTORY_SCOPE;
  }

  return args.search.liabilityScope ?? DEFAULT_HISTORY_SCOPE;
}

export function getHistoryScopedMetric(
  metric: HistoryMetric,
): HistoryScopedMetric | undefined {
  return isHistoryScopedMetric(metric) ? metric : undefined;
}
