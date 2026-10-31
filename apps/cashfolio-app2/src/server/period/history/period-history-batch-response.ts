import {
  createHistoryScopeOptionsWithTotal,
  sortGainLossScopeOptions,
  clampHistoryScopeSelection,
} from "../../../shared/history-scope-options";
import type { HistoryScopedMetric } from "../../../shared/history-scope";
import { toNumericMoney } from "../../money-boundary";
import type { HistoryInput } from "./period-history-input";
import type { PeriodHistoryPointContext } from "./period-history-point.server";
import type { LoadedHistoryBatch } from "./period-history-batch.server";
import type {
  PeriodHistoryBatchResponse,
  PeriodHistoryPoint,
} from "./period-history-types";

const metrics = [
  "cashFlow",
  "income",
  "expenses",
  "gainsLosses",
  "netWorth",
] as const;
type BatchResponseInput = LoadedHistoryBatch & {
  data: HistoryInput;
  context: PeriodHistoryPointContext;
  nextBefore?: string;
};
type ScopeOptions = PeriodHistoryBatchResponse["scopeOptions"];
type ScopeSelection = PeriodHistoryBatchResponse["scopeSelection"];

function mergeScopeOptions({
  loadedPoints,
  context,
}: BatchResponseInput): ScopeOptions {
  const scopeOptions = {} as ScopeOptions;
  for (const metric of metrics) {
    const options = new Map(
      (metric === "netWorth" ? context.netWorthScopes : []).map((option) => [
        option.value,
        option,
      ]),
    );
    for (const point of loadedPoints)
      for (const option of point.scopeOptions[metric])
        options.set(option.value, option);
    scopeOptions[metric] =
      metric === "gainsLosses"
        ? createHistoryScopeOptionsWithTotal(
            sortGainLossScopeOptions(options.values()),
            { sort: "none" },
          )
        : createHistoryScopeOptionsWithTotal(options.values());
  }
  return scopeOptions;
}

function selectScopes(
  { data, nextBefore }: BatchResponseInput,
  options: ScopeOptions,
): ScopeSelection {
  const selection: ScopeSelection = {
    cashFlow: data.cashFlowScope,
    income: data.incomeScope,
    expenses: data.expenseScope,
    gainsLosses: data.gainLossScope,
    netWorth: data.netWorthScope,
  };
  if (!nextBefore && !data.before)
    for (const metric of metrics)
      selection[metric] = clampHistoryScopeSelection({
        requested: selection[metric],
        options: options[metric],
      });
  return selection;
}

function mapPoint(
  point: LoadedHistoryBatch["loadedPoints"][number],
  metric: HistoryScopedMetric | undefined,
  selection: ScopeSelection,
): PeriodHistoryPoint {
  const scopedValue = toNumericMoney(point.scopedMetricValue ?? 0);
  const result = toNumericMoney({
    periodValue: point.selectedPeriodValue,
    periodLabel: point.selectedPeriodLabel,
    periodEndDate: point.selectedPeriodEnd.toISOString(),
    totalReturn: point.totalReturn,
    savings: point.savings,
    cashFlow: point.cashFlow,
    income: point.income,
    expenses: point.expenses,
    gainsLosses: point.gainsLosses,
    assets: point.assets,
    liabilities: point.liabilities,
    netWorth: point.netWorth,
  });
  if (metric && selection[metric] !== "total") result[metric] = scopedValue;
  return result;
}

function mapOpeningBalance(
  { openingBalancePoint, data }: BatchResponseInput,
  selection: ScopeSelection,
) {
  if (!openingBalancePoint) return null;
  const { scopedMetricValue, ...baseOpeningBalancePoint } = openingBalancePoint;
  return toNumericMoney({
    ...baseOpeningBalancePoint,
    netWorth:
      data.scopedMetric === "netWorth" && selection.netWorth !== "total"
        ? (scopedMetricValue ?? 0)
        : openingBalancePoint.netWorth,
  });
}

export function buildHistoryBatchResponse(
  args: BatchResponseInput,
): PeriodHistoryBatchResponse {
  const scopeOptions = mergeScopeOptions(args);
  const scopeSelection = selectScopes(args, scopeOptions);
  return {
    revision: args.context.revision,
    nextBefore: args.nextBefore,
    referenceCurrency: args.context.referenceCurrency,
    hasCashAccounts: args.context.hasCashAccounts,
    openingBalancePoint: mapOpeningBalance(args, scopeSelection),
    points: args.loadedPoints.map((point) =>
      mapPoint(point, args.data.scopedMetric, scopeSelection),
    ),
    scopeOptions,
    scopeSelection,
  };
}
