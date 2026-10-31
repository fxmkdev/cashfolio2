import {
  readHistoryPageSize,
  type HistoryGranularity,
} from "../../../shared/history-window-policy";
import {
  isHistoryScopedMetric,
  parseHistoryScopeSelection,
  type HistoryScopeSelection,
  type HistoryScopedMetric,
} from "../../../shared/history-scope";
import {
  normalizeUserLocaleInput,
  type UserLocale,
} from "../../../user-locale";

export type HistoryInput = {
  before?: string;
  pageSize: number;
  accountBookId: string;
  granularity: HistoryGranularity;
  scopedMetric?: HistoryScopedMetric;
  cashFlowScope: HistoryScopeSelection;
  incomeScope: HistoryScopeSelection;
  expenseScope: HistoryScopeSelection;
  gainLossScope: HistoryScopeSelection;
  netWorthScope: HistoryScopeSelection;
  locale: UserLocale;
};

function readHistoryCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 7)
    throw new Error("Invalid History cursor.");
  return value;
}

function parseHistoryGranularity(value: unknown): HistoryGranularity {
  if (value === "month" || value === "year") return value;
  throw new Response("Invalid history granularity. Use month or year.", {
    status: 400,
  });
}

function parseOptionalHistoryScopedMetric(
  value: unknown,
): HistoryScopedMetric | undefined {
  return isHistoryScopedMetric(value) ? value : undefined;
}

function parseHistoryScopeSelectionOrDefault(
  value: unknown,
): HistoryScopeSelection {
  return parseHistoryScopeSelection(value) ?? "total";
}

export function validateHistoryInput(data: {
  accountBookId: string;
  granularity: unknown;
  before?: unknown;
  pageSize?: unknown;
  scopedMetric?: unknown;
  cashFlowScope?: unknown;
  incomeScope?: unknown;
  expenseScope?: unknown;
  gainLossScope?: unknown;
  netWorthScope?: unknown;
  locale?: unknown;
}): HistoryInput {
  return {
    accountBookId: data.accountBookId,
    before: readHistoryCursor(data.before),
    granularity: parseHistoryGranularity(data.granularity),
    pageSize: readHistoryPageSize(
      data.pageSize,
      parseHistoryGranularity(data.granularity),
    ),
    scopedMetric: parseOptionalHistoryScopedMetric(data.scopedMetric),
    cashFlowScope: parseHistoryScopeSelectionOrDefault(data.cashFlowScope),
    incomeScope: parseHistoryScopeSelectionOrDefault(data.incomeScope),
    expenseScope: parseHistoryScopeSelectionOrDefault(data.expenseScope),
    gainLossScope: parseHistoryScopeSelectionOrDefault(data.gainLossScope),
    netWorthScope: parseHistoryScopeSelectionOrDefault(data.netWorthScope),
    locale: normalizeUserLocaleInput(data.locale),
  };
}
