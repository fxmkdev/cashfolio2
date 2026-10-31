import type {
  PeriodHistoryBatchResponse,
  PeriodHistoryResponse,
} from "@/server/period-history";
import type {
  HistoryScopeSelection,
  HistoryScopedMetric,
} from "@/shared/history-scope";
import {
  clampHistoryScopeSelection,
  createHistoryScopeOptionsWithTotal,
  sortGainLossScopeOptions,
} from "@/shared/history-scope-options";
import { readHistoryPageSize } from "@/shared/history-window-policy";
import { ResourceLimitError } from "@/shared/resource-error";
import type { UserLocale } from "@/user-locale";
import type { HistoryPeriodMode } from "./-page-types";

export type HistoryLoadRequest = {
  accountBookId: string;
  mode: HistoryPeriodMode;
  scopedMetric?: HistoryScopedMetric;
  cashFlowScope: HistoryScopeSelection;
  incomeScope: HistoryScopeSelection;
  expenseScope: HistoryScopeSelection;
  gainLossScope: HistoryScopeSelection;
  netWorthScope: HistoryScopeSelection;
  locale: UserLocale;
};
export type HistoryBatchRequest = HistoryLoadRequest & {
  before?: string;
  pageSize: number;
  signal: AbortSignal;
};
type FetchBatch = (
  request: HistoryBatchRequest,
) => Promise<PeriodHistoryBatchResponse>;

function mergeBatch(
  current: PeriodHistoryBatchResponse | undefined,
  batch: PeriodHistoryBatchResponse,
): PeriodHistoryBatchResponse {
  if (!current) return batch;
  const points = new Map(
    current.points.map((point) => [point.periodValue, point]),
  );
  for (const point of batch.points) points.set(point.periodValue, point);
  const scopeOptions = { ...batch.scopeOptions };
  for (const key of Object.keys(
    scopeOptions,
  ) as (keyof typeof scopeOptions)[]) {
    const options = [...current.scopeOptions[key], ...batch.scopeOptions[key]];
    scopeOptions[key] =
      key === "gainsLosses"
        ? createHistoryScopeOptionsWithTotal(
            sortGainLossScopeOptions(
              options.filter((option) => option.value !== "total"),
            ),
            { sort: "none" },
          )
        : createHistoryScopeOptionsWithTotal(options);
  }
  return {
    ...batch,
    points: [...points.values()].sort((a, b) =>
      a.periodValue.localeCompare(b.periodValue),
    ),
    scopeOptions,
  };
}

async function fetchBoundedBatch(
  request: HistoryBatchRequest,
  fetchBatch: FetchBatch,
) {
  let pageSize = request.pageSize;
  while (true) {
    request.signal.throwIfAborted();
    try {
      const batch = await fetchBatch({ ...request, pageSize });
      request.signal.throwIfAborted();
      return { batch, pageSize };
    } catch (error) {
      request.signal.throwIfAborted();
      if (
        !(error instanceof ResourceLimitError) ||
        !(
          (error.code === "provider_request_limit" && error.status === 429) ||
          (error.code === "read_deadline" && error.status === 503)
        )
      )
        throw error;
      if (pageSize === 1)
        throw new Error(
          "History could not be completed within the calculation limits. Please try again later.",
          { cause: error },
        );
      pageSize = Math.max(1, Math.floor(pageSize / 2));
    }
  }
}

function validateBatch(
  current: PeriodHistoryBatchResponse | undefined,
  batch: PeriodHistoryBatchResponse,
  before: string | undefined,
) {
  if (!batch.revision)
    throw new Error("History returned an invalid revision. Please retry.");
  if (current && batch.revision !== current.revision)
    throw new Error(
      "The account book changed while loading History. Please retry.",
    );
  if (
    batch.nextBefore &&
    (!batch.points.length ||
      batch.nextBefore !== batch.points[0].periodValue ||
      (before && batch.nextBefore >= before))
  )
    throw new Error("History returned an invalid continuation. Please retry.");
}

function completeHistory(
  batch: PeriodHistoryBatchResponse,
): PeriodHistoryResponse {
  if (!batch.openingBalancePoint)
    throw new Error("History is missing its opening balance. Please retry.");
  const selection = { ...batch.scopeSelection };
  for (const key of Object.keys(selection) as (keyof typeof selection)[])
    selection[key] = clampHistoryScopeSelection({
      requested: selection[key],
      options: batch.scopeOptions[key],
    });
  return {
    referenceCurrency: batch.referenceCurrency,
    hasCashAccounts: batch.hasCashAccounts,
    points: batch.points,
    scopeOptions: batch.scopeOptions,
    openingBalancePoint: batch.openingBalancePoint,
    scopeSelection: selection,
  };
}

/** Each invocation starts fresh and publishes only a complete, consistent history. */
export async function loadCompleteHistory(
  request: HistoryLoadRequest,
  fetchBatch: FetchBatch,
  signal: AbortSignal,
): Promise<PeriodHistoryResponse> {
  let pageSize = readHistoryPageSize(undefined, request.mode);
  let currentRequest = request;
  for (let normalization = 0; ; normalization++) {
    let accumulated: PeriodHistoryBatchResponse | undefined;
    do {
      signal.throwIfAborted();
      const before = accumulated?.nextBefore;
      const result = await fetchBoundedBatch(
        { ...currentRequest, before, pageSize, signal },
        fetchBatch,
      );
      pageSize = result.pageSize;
      validateBatch(accumulated, result.batch, before);
      accumulated = mergeBatch(accumulated, result.batch);
    } while (accumulated.nextBefore);
    const history = completeHistory(accumulated);
    const metric = currentRequest.scopedMetric;
    if (
      !metric ||
      history.scopeSelection[metric] === accumulated.scopeSelection[metric]
    )
      return history;
    if (normalization > 0)
      throw new Error("History scopes changed. Please retry.");
    currentRequest = {
      ...currentRequest,
      cashFlowScope: history.scopeSelection.cashFlow,
      incomeScope: history.scopeSelection.income,
      expenseScope: history.scopeSelection.expenses,
      gainLossScope: history.scopeSelection.gainsLosses,
      netWorthScope: history.scopeSelection.netWorth,
    };
  }
}
