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
  | "cashFlow"
  | "income"
  | "expenses"
  | "gainsLosses"
  | "assets"
  | "liabilities"
  | "netWorth";

export type HistoryViewSelection = {
  metric: HistoryMetric;
  scope: HistoryScopeSelection;
};

export type HistorySearch = {
  mode?: HistoryPeriodMode;
  metric?: HistoryMetric;
  cashFlowScope?: HistoryScopeSelection;
  incomeScope?: HistoryScopeSelection;
  expenseScope?: HistoryScopeSelection;
  gainLossScope?: HistoryScopeSelection;
  netWorthScope?: HistoryScopeSelection;
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
    value === "cashFlow" ||
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
  { value: "cashFlow", label: "Cash Flow" },
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
  const legacyScope =
    search.metric === "assets"
      ? search.assetScope
      : search.metric === "liabilities"
        ? search.liabilityScope
        : undefined;
  const migrateLegacyScope =
    (search.metric === "assets" || search.metric === "liabilities") &&
    legacyScope !== undefined &&
    legacyScope !== "total";
  const netWorthScope =
    "netWorthScope" in search
      ? search.netWorthScope
      : migrateLegacyScope
        ? legacyScope
        : undefined;
  return {
    ...("mode" in search
      ? { mode: isHistoryPeriodMode(search.mode) ? search.mode : undefined }
      : {}),
    ...("metric" in search
      ? {
          metric: migrateLegacyScope
            ? "netWorth"
            : isHistoryMetric(search.metric)
              ? search.metric
              : undefined,
        }
      : {}),
    ...("cashFlowScope" in search
      ? { cashFlowScope: parseHistoryScopeSelection(search.cashFlowScope) }
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
    ...("netWorthScope" in search || migrateLegacyScope
      ? { netWorthScope: parseHistoryScopeSelection(netWorthScope) }
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
  if (args.metric === "cashFlow") {
    return args.search.cashFlowScope ?? DEFAULT_HISTORY_SCOPE;
  }

  if (args.metric === "income") {
    return args.search.incomeScope ?? DEFAULT_HISTORY_SCOPE;
  }

  if (args.metric === "expenses") {
    return args.search.expenseScope ?? DEFAULT_HISTORY_SCOPE;
  }

  if (args.metric === "gainsLosses") {
    return args.search.gainLossScope ?? DEFAULT_HISTORY_SCOPE;
  }

  return args.search.netWorthScope ?? DEFAULT_HISTORY_SCOPE;
}

export function getHistoryScopedMetric(
  metric: HistoryMetric,
): HistoryScopedMetric | undefined {
  return isHistoryScopedMetric(metric) ? metric : undefined;
}
