import { assetClassOptions } from "../../../shared/asset-class";
import { toNumericMoney } from "../../money-boundary";
import { createServerFn } from "@tanstack/react-start";
import { formatMonthPeriodValue } from "../../../shared/period";
import { startOfUtcDay } from "../../../shared/date";
import type { HistoryOpeningBalancePoint } from "./period-history-opening-balance.server";
import {
  isHistoryScopedMetric,
  normalizeGainLossScope,
  parseHistoryScopeSelection,
  type HistoryScopeOption,
  type HistoryScopeSelection,
  type HistoryScopedMetric,
} from "../../../shared/history-scope";
import type { HistoryValuationContext } from "./period-history-point-metrics.server";
import { mapWithConcurrencyLimit } from "../../concurrency";
import {
  normalizeUserLocaleInput,
  type UserLocale,
} from "../../../user-locale";

export type PeriodHistoryGranularity = "month" | "year";

const HISTORY_POINT_LOAD_CONCURRENCY = 4;
const GAIN_LOSS_ROOT_SCOPE_ORDER: HistoryScopeSelection[] = [
  ...assetClassOptions.map((option) => `asset-class:${option.value}` as const),
  "asset-class:unclassified",
];

export type PeriodHistoryPoint = {
  periodValue: string;
  periodLabel: string;
  periodEndDate: string;
  totalReturn: number;
  savings: number;
  cashFlow: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type PeriodHistoryOpeningBalancePoint =
  import("../../money-boundary").NumericMoney<HistoryOpeningBalancePoint>;

export type PeriodHistoryResponse = {
  referenceCurrency: string;
  hasCashAccounts: boolean;
  openingBalancePoint: PeriodHistoryOpeningBalancePoint;
  points: PeriodHistoryPoint[];
  scopeOptions: {
    cashFlow: HistoryScopeOption[];
    income: HistoryScopeOption[];
    expenses: HistoryScopeOption[];
    gainsLosses: HistoryScopeOption[];
    netWorth: HistoryScopeOption[];
  };
  scopeSelection: {
    cashFlow: HistoryScopeSelection;
    income: HistoryScopeSelection;
    expenses: HistoryScopeSelection;
    gainsLosses: HistoryScopeSelection;
    netWorth: HistoryScopeSelection;
  };
};

type HistoryInput = {
  accountBookId: string;
  granularity: PeriodHistoryGranularity;
  scopedMetric?: HistoryScopedMetric;
  cashFlowScope: HistoryScopeSelection;
  incomeScope: HistoryScopeSelection;
  expenseScope: HistoryScopeSelection;
  gainLossScope: HistoryScopeSelection;
  netWorthScope: HistoryScopeSelection;
  locale: UserLocale;
};

function toMonthIndex(year: number, month: number): number {
  return year * 12 + month;
}

function parseHistoryGranularity(value: unknown): PeriodHistoryGranularity {
  if (value === "month" || value === "year") {
    return value;
  }

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

function createHistoryScopeOptionsWithTotal(
  options: Iterable<HistoryScopeOption>,
  args?: { sort?: "label" | "none" },
): HistoryScopeOption[] {
  const optionByValue = new Map<HistoryScopeSelection, HistoryScopeOption>();
  for (const option of options) {
    optionByValue.set(option.value, option);
  }

  const dedupedOptions = Array.from(optionByValue.values());
  const sortedOptions =
    args?.sort === "none"
      ? dedupedOptions
      : dedupedOptions.toSorted(
          (left, right) =>
            left.label.localeCompare(right.label, "en") ||
            left.value.localeCompare(right.value, "en"),
        );
  return [
    {
      value: "total",
      label: "Total",
      kind: "total",
    },
    ...sortedOptions,
  ];
}

function resolveGainLossScopeOptionPath(args: {
  option: HistoryScopeOption;
  optionByValue: Map<HistoryScopeSelection, HistoryScopeOption>;
}): HistoryScopeOption[] {
  const path: HistoryScopeOption[] = [];
  const visitedValues = new Set<HistoryScopeSelection>();
  let currentOption: HistoryScopeOption | undefined = args.option;

  while (currentOption && !visitedValues.has(currentOption.value)) {
    path.unshift(currentOption);
    visitedValues.add(currentOption.value);
    currentOption = currentOption.parentValue
      ? args.optionByValue.get(currentOption.parentValue)
      : undefined;
  }

  return path;
}

function compareGainLossScopeOptionPaths(
  leftPath: HistoryScopeOption[],
  rightPath: HistoryScopeOption[],
): number {
  const leftRootRank =
    leftPath[0]!.sortOrder ??
    GAIN_LOSS_ROOT_SCOPE_ORDER.indexOf(leftPath[0]!.value);
  const rightRootRank =
    rightPath[0]!.sortOrder ??
    GAIN_LOSS_ROOT_SCOPE_ORDER.indexOf(rightPath[0]!.value);
  const leftRank =
    leftRootRank === -1 ? GAIN_LOSS_ROOT_SCOPE_ORDER.length : leftRootRank;
  const rightRank =
    rightRootRank === -1 ? GAIN_LOSS_ROOT_SCOPE_ORDER.length : rightRootRank;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const maxLength = Math.max(leftPath.length, rightPath.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftOption = leftPath[index];
    const rightOption = rightPath[index];
    if (!leftOption) {
      return -1;
    }
    if (!rightOption) {
      return 1;
    }

    const orderComparison =
      (leftOption.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (rightOption.sortOrder ?? Number.MAX_SAFE_INTEGER);
    if (orderComparison !== 0) return orderComparison;
    const labelComparison =
      leftOption.label.localeCompare(rightOption.label, "en") ||
      leftOption.value.localeCompare(rightOption.value, "en");
    if (labelComparison !== 0) {
      return labelComparison;
    }
  }

  return 0;
}

function sortGainLossScopeOptions(
  options: Iterable<HistoryScopeOption>,
): HistoryScopeOption[] {
  const optionByValue = new Map(
    Array.from(options, (option) => [option.value, option]),
  );

  return Array.from(optionByValue.values()).toSorted((left, right) =>
    compareGainLossScopeOptionPaths(
      resolveGainLossScopeOptionPath({ option: left, optionByValue }),
      resolveGainLossScopeOptionPath({ option: right, optionByValue }),
    ),
  );
}

function clampHistoryScopeSelection(args: {
  requested: HistoryScopeSelection;
  options: HistoryScopeOption[];
}): HistoryScopeSelection {
  if (args.options.some((option) => option.value === args.requested)) {
    return args.requested;
  }

  return "total";
}

export function buildHistoryPeriodValues(args: {
  granularity: PeriodHistoryGranularity;
  minDate: Date;
  maxDate: Date;
}): string[] {
  const minDate = startOfUtcDay(args.minDate);
  const maxDate = startOfUtcDay(args.maxDate);

  if (args.granularity === "year") {
    const minYear = minDate.getUTCFullYear();
    const maxYear = maxDate.getUTCFullYear();
    if (minYear > maxYear) {
      return [];
    }

    const values: string[] = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      values.push(String(year));
    }
    return values;
  }

  const minMonthIndex = toMonthIndex(
    minDate.getUTCFullYear(),
    minDate.getUTCMonth(),
  );
  const maxMonthIndex = toMonthIndex(
    maxDate.getUTCFullYear(),
    maxDate.getUTCMonth(),
  );

  if (minMonthIndex > maxMonthIndex) {
    return [];
  }

  const values: string[] = [];
  for (
    let monthIndex = minMonthIndex;
    monthIndex <= maxMonthIndex;
    monthIndex += 1
  ) {
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    values.push(formatMonthPeriodValue(year, month));
  }
  return values;
}

export const getPeriodHistory = createServerFn({
  method: "GET",
})
  .validator(
    (data: {
      accountBookId: string;
      granularity: unknown;
      scopedMetric?: unknown;
      cashFlowScope?: unknown;
      incomeScope?: unknown;
      expenseScope?: unknown;
      gainLossScope?: unknown;
      netWorthScope?: unknown;
      locale?: unknown;
    }): HistoryInput => ({
      accountBookId: data.accountBookId,
      granularity: parseHistoryGranularity(data.granularity),
      scopedMetric: parseOptionalHistoryScopedMetric(data.scopedMetric),
      cashFlowScope: parseHistoryScopeSelectionOrDefault(data.cashFlowScope),
      incomeScope: parseHistoryScopeSelectionOrDefault(data.incomeScope),
      expenseScope: parseHistoryScopeSelectionOrDefault(data.expenseScope),
      gainLossScope: parseHistoryScopeSelectionOrDefault(data.gainLossScope),
      netWorthScope: parseHistoryScopeSelectionOrDefault(data.netWorthScope),
      locale: normalizeUserLocaleInput(data.locale),
    }),
  )
  .handler(async ({ data }) => {
    const { ensureAuthorizedForAccountBookId } =
      await import("../../../account-books/functions.server");
    const { loadPeriodHistoryPoint, loadPeriodHistoryPointContext } =
      await import("./period-history-point.server");
    const { loadHistoryOpeningBalancePoint } =
      await import("./period-history-opening-balance.server");
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const context = await loadPeriodHistoryPointContext({
      accountBookId: data.accountBookId,
    });
    data.gainLossScope = normalizeGainLossScope(
      data.gainLossScope,
      context.gainLossAccountScopes ?? [],
    );
    if (
      context.assetClassScopes &&
      data.gainLossScope.startsWith("asset-class:") &&
      !context.assetClassScopes.some(
        (option) => option.value === data.gainLossScope,
      )
    )
      data.gainLossScope = "total";
    const activeMetricScopeFilter = (() => {
      if (data.scopedMetric === "cashFlow" && data.cashFlowScope !== "total") {
        return {
          metric: "cashFlow" as const,
          scope: data.cashFlowScope,
        };
      }
      if (data.scopedMetric === "income" && data.incomeScope !== "total") {
        return {
          metric: "income" as const,
          scope: data.incomeScope,
        };
      }
      if (data.scopedMetric === "expenses" && data.expenseScope !== "total") {
        return {
          metric: "expenses" as const,
          scope: data.expenseScope,
        };
      }
      if (
        data.scopedMetric === "gainsLosses" &&
        data.gainLossScope !== "total"
      ) {
        return {
          metric: "gainsLosses" as const,
          scope: data.gainLossScope,
        };
      }
      if (data.scopedMetric === "netWorth" && data.netWorthScope !== "total") {
        return { metric: "netWorth" as const, scope: data.netWorthScope };
      }
      return undefined;
    })();
    const openingBalancePoint = await loadHistoryOpeningBalancePoint({
      accountBookId: data.accountBookId,
      accountBookStartDate: context.accountBookStartDate,
      referenceCurrency: context.referenceCurrency,
      metricScopeFilter:
        activeMetricScopeFilter?.metric === "netWorth"
          ? activeMetricScopeFilter
          : undefined,
    });

    const periodValues = buildHistoryPeriodValues({
      granularity: data.granularity,
      minDate: context.accountBookStartDate,
      maxDate: new Date(),
    });

    const cashFlowScopeOptions = new Map<
      HistoryScopeSelection,
      HistoryScopeOption
    >();
    const incomeScopeOptions = new Map<
      HistoryScopeSelection,
      HistoryScopeOption
    >();
    const expenseScopeOptions = new Map<
      HistoryScopeSelection,
      HistoryScopeOption
    >();
    const gainLossScopeOptions = new Map<
      HistoryScopeSelection,
      HistoryScopeOption
    >();
    for (const option of context.assetClassScopes ?? [])
      gainLossScopeOptions.set(option.value, option);
    const netWorthScopeOptions = new Map<
      HistoryScopeSelection,
      HistoryScopeOption
    >(context.netWorthScopes.map((option) => [option.value, option]));

    const valuationContext: HistoryValuationContext = {
      exchangeRateByKey: new Map(),
    };
    const loadedPoints = await mapWithConcurrencyLimit(
      periodValues,
      HISTORY_POINT_LOAD_CONCURRENCY,
      (periodValue) =>
        loadPeriodHistoryPoint({
          accountBookId: data.accountBookId,
          period: periodValue,
          context,
          metricScopeFilter: activeMetricScopeFilter,
          valuationContext,
          locale: data.locale,
        }),
    );

    const points: PeriodHistoryPoint[] = [];
    const scopedMetricValues: number[] = [];
    for (const point of loadedPoints) {
      for (const option of point.scopeOptions.cashFlow) {
        cashFlowScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.income) {
        incomeScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.expenses) {
        expenseScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.gainsLosses) {
        gainLossScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.netWorth) {
        netWorthScopeOptions.set(option.value, option);
      }
      scopedMetricValues.push(toNumericMoney(point.scopedMetricValue ?? 0));
      points.push(
        toNumericMoney({
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
        }),
      );
    }

    const finalizedCashFlowScopeOptions = createHistoryScopeOptionsWithTotal(
      cashFlowScopeOptions.values(),
    );
    const finalizedIncomeScopeOptions = createHistoryScopeOptionsWithTotal(
      incomeScopeOptions.values(),
    );
    const finalizedExpenseScopeOptions = createHistoryScopeOptionsWithTotal(
      expenseScopeOptions.values(),
    );
    const finalizedGainLossScopeOptions = createHistoryScopeOptionsWithTotal(
      sortGainLossScopeOptions(gainLossScopeOptions.values()),
      { sort: "none" },
    );
    const finalizedNetWorthScopeOptions = createHistoryScopeOptionsWithTotal(
      netWorthScopeOptions.values(),
    );
    const clampedCashFlowScope = clampHistoryScopeSelection({
      requested: data.cashFlowScope,
      options: finalizedCashFlowScopeOptions,
    });
    const clampedIncomeScope = clampHistoryScopeSelection({
      requested: data.incomeScope,
      options: finalizedIncomeScopeOptions,
    });
    const clampedExpenseScope = clampHistoryScopeSelection({
      requested: data.expenseScope,
      options: finalizedExpenseScopeOptions,
    });
    const clampedGainLossScope = clampHistoryScopeSelection({
      requested: data.gainLossScope,
      options: finalizedGainLossScopeOptions,
    });
    const clampedNetWorthScope = clampHistoryScopeSelection({
      requested: data.netWorthScope,
      options: finalizedNetWorthScopeOptions,
    });
    const shouldUseScopedCashFlow =
      data.scopedMetric === "cashFlow" && clampedCashFlowScope !== "total";
    const shouldUseScopedIncome =
      data.scopedMetric === "income" && clampedIncomeScope !== "total";
    const shouldUseScopedExpenses =
      data.scopedMetric === "expenses" && clampedExpenseScope !== "total";
    const shouldUseScopedGainLosses =
      data.scopedMetric === "gainsLosses" && clampedGainLossScope !== "total";
    const shouldUseScopedNetWorth =
      data.scopedMetric === "netWorth" && clampedNetWorthScope !== "total";
    const responsePoints = points.map((point, index) => ({
      ...point,
      cashFlow: shouldUseScopedCashFlow
        ? (scopedMetricValues[index] ?? 0)
        : point.cashFlow,
      income: shouldUseScopedIncome
        ? (scopedMetricValues[index] ?? 0)
        : point.income,
      expenses: shouldUseScopedExpenses
        ? (scopedMetricValues[index] ?? 0)
        : point.expenses,
      gainsLosses: shouldUseScopedGainLosses
        ? (scopedMetricValues[index] ?? 0)
        : point.gainsLosses,
      netWorth: shouldUseScopedNetWorth
        ? (scopedMetricValues[index] ?? 0)
        : point.netWorth,
    }));
    const { scopedMetricValue, ...baseOpeningBalancePoint } =
      openingBalancePoint;
    const responseOpeningBalancePoint = {
      ...baseOpeningBalancePoint,
      netWorth: shouldUseScopedNetWorth
        ? (scopedMetricValue ?? 0)
        : openingBalancePoint.netWorth,
    };

    return {
      referenceCurrency: context.referenceCurrency,
      hasCashAccounts: context.hasCashAccounts,
      openingBalancePoint: toNumericMoney(responseOpeningBalancePoint),
      points: responsePoints,
      scopeOptions: {
        cashFlow: finalizedCashFlowScopeOptions,
        income: finalizedIncomeScopeOptions,
        expenses: finalizedExpenseScopeOptions,
        gainsLosses: finalizedGainLossScopeOptions,
        netWorth: finalizedNetWorthScopeOptions,
      },
      scopeSelection: {
        cashFlow: clampedCashFlowScope,
        income: clampedIncomeScope,
        expenses: clampedExpenseScope,
        gainsLosses: clampedGainLossScope,
        netWorth: clampedNetWorthScope,
      },
    } satisfies PeriodHistoryResponse;
  });
