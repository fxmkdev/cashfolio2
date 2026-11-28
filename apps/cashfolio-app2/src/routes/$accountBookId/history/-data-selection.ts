import {
  getHistoryMetric,
  getHistoryMode,
  getHistoryScopeForMetric,
  getHistoryScopedMetric,
  type HistorySearch,
} from "./-page-types";
import type {
  HistoryLoadRequest,
  HistoryDisplayData,
} from "./-history-loading";
import { clampHistoryScopeSelection } from "@/shared/reporting/history-scope-options";

/** Aggregate views all use the same dataset; inactive saved scopes are UI state. */
export function getHistoryDataSelection(search: HistorySearch) {
  const metric = getHistoryScopedMetric(getHistoryMetric(search));
  const scope = metric ? getHistoryScopeForMetric({ search, metric }) : "total";
  return {
    mode: getHistoryMode(search),
    scopedMetric: scope === "total" ? undefined : metric,
    scope,
  };
}

export function createHistoryLoadRequest(
  args: ReturnType<typeof getHistoryDataSelection> &
    Pick<HistoryLoadRequest, "accountBookId" | "locale">,
): HistoryLoadRequest {
  const { scopedMetric, scope } = args;
  return {
    accountBookId: args.accountBookId,
    mode: args.mode,
    locale: args.locale,
    scopedMetric,
    cashFlowScope: scopedMetric === "cashFlow" ? scope : "total",
    incomeScope: scopedMetric === "income" ? scope : "total",
    expenseScope: scopedMetric === "expenses" ? scope : "total",
    gainLossScope: scopedMetric === "gainsLosses" ? scope : "total",
    netWorthScope: scopedMetric === "netWorth" ? scope : "total",
  };
}

export function selectHistoryDisplayScopes(
  history: HistoryDisplayData,
  search: HistorySearch,
  complete: boolean,
): HistoryDisplayData {
  const scopeSelection = { ...history.scopeSelection };
  const active = getHistoryDataSelection(search).scopedMetric;
  for (const metric of Object.keys(
    scopeSelection,
  ) as (keyof typeof scopeSelection)[]) {
    if (metric === active) continue;
    const requested = getHistoryScopeForMetric({ search, metric });
    scopeSelection[metric] = complete
      ? clampHistoryScopeSelection({
          requested,
          options: history.scopeOptions[metric],
        })
      : requested;
  }
  return { ...history, scopeSelection };
}
