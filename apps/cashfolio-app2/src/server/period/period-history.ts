import { createServerFn } from "@tanstack/react-start";
import { formatMonthPeriodValue } from "../../shared/period";
import { startOfUtcDay } from "../../shared/date";
import type { HistoryOpeningBalancePoint } from "./period-history-opening-balance.server";
import {
  isHistoryScopedMetric,
  parseHistoryScopeSelection,
  type HistoryScopeOption,
  type HistoryScopeSelection,
  type HistoryScopedMetric,
} from "../../shared/history-scope";
import type { HistoryValuationContext } from "./period-history-point-metrics.server";
import { mapWithConcurrencyLimit } from "../concurrency";
import { normalizeUserLocaleInput, type UserLocale } from "../../user-locale";

export type PeriodHistoryGranularity = "month" | "year";

const HISTORY_POINT_LOAD_CONCURRENCY = 4;
const GAIN_LOSS_ROOT_SCOPE_ORDER: HistoryScopeSelection[] = [
  "unit-type:fx",
  "unit-type:security",
  "unit-type:cryptocurrency",
  "unit-type:explicit",
];

export type PeriodHistoryPoint = {
  periodValue: string;
  periodLabel: string;
  periodEndDate: string;
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type PeriodHistoryOpeningBalancePoint = HistoryOpeningBalancePoint;

export type PeriodHistoryResponse = {
  referenceCurrency: string;
  openingBalancePoint: PeriodHistoryOpeningBalancePoint;
  points: PeriodHistoryPoint[];
  scopeOptions: {
    income: HistoryScopeOption[];
    expenses: HistoryScopeOption[];
    gainsLosses: HistoryScopeOption[];
    assets: HistoryScopeOption[];
    liabilities: HistoryScopeOption[];
  };
  scopeSelection: {
    income: HistoryScopeSelection;
    expenses: HistoryScopeSelection;
    gainsLosses: HistoryScopeSelection;
    assets: HistoryScopeSelection;
    liabilities: HistoryScopeSelection;
  };
};

type HistoryInput = {
  accountBookId: string;
  granularity: PeriodHistoryGranularity;
  scopedMetric?: HistoryScopedMetric;
  incomeScope: HistoryScopeSelection;
  expenseScope: HistoryScopeSelection;
  gainLossScope: HistoryScopeSelection;
  assetScope: HistoryScopeSelection;
  liabilityScope: HistoryScopeSelection;
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
  const leftRootRank = GAIN_LOSS_ROOT_SCOPE_ORDER.indexOf(leftPath[0]!.value);
  const rightRootRank = GAIN_LOSS_ROOT_SCOPE_ORDER.indexOf(rightPath[0]!.value);
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
  .inputValidator(
    (data: {
      accountBookId: string;
      granularity: unknown;
      scopedMetric?: unknown;
      incomeScope?: unknown;
      expenseScope?: unknown;
      gainLossScope?: unknown;
      assetScope?: unknown;
      liabilityScope?: unknown;
      locale?: unknown;
    }): HistoryInput => ({
      accountBookId: data.accountBookId,
      granularity: parseHistoryGranularity(data.granularity),
      scopedMetric: parseOptionalHistoryScopedMetric(data.scopedMetric),
      incomeScope: parseHistoryScopeSelectionOrDefault(data.incomeScope),
      expenseScope: parseHistoryScopeSelectionOrDefault(data.expenseScope),
      gainLossScope: parseHistoryScopeSelectionOrDefault(data.gainLossScope),
      assetScope: parseHistoryScopeSelectionOrDefault(data.assetScope),
      liabilityScope: parseHistoryScopeSelectionOrDefault(data.liabilityScope),
      locale: normalizeUserLocaleInput(data.locale),
    }),
  )
  .handler(async ({ data }) => {
    const { ensureAuthorizedForAccountBookId } =
      await import("../../account-books/functions.server");
    const { loadPeriodHistoryPoint, loadPeriodHistoryPointContext } =
      await import("./period-history-point.server");
    const { loadHistoryOpeningBalancePoint } =
      await import("./period-history-opening-balance.server");
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const context = await loadPeriodHistoryPointContext({
      accountBookId: data.accountBookId,
    });
    const activeMetricScopeFilter = (() => {
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
      if (data.scopedMetric === "assets" && data.assetScope !== "total") {
        return {
          metric: "assets" as const,
          scope: data.assetScope,
        };
      }
      if (
        data.scopedMetric === "liabilities" &&
        data.liabilityScope !== "total"
      ) {
        return {
          metric: "liabilities" as const,
          scope: data.liabilityScope,
        };
      }
      return undefined;
    })();
    const openingBalancePoint = await loadHistoryOpeningBalancePoint({
      accountBookId: data.accountBookId,
      accountBookStartDate: context.accountBookStartDate,
      referenceCurrency: context.referenceCurrency,
      metricScopeFilter:
        activeMetricScopeFilter?.metric === "assets" ||
        activeMetricScopeFilter?.metric === "liabilities"
          ? activeMetricScopeFilter
          : undefined,
    });

    const periodValues = buildHistoryPeriodValues({
      granularity: data.granularity,
      minDate: context.accountBookStartDate,
      maxDate: new Date(),
    });

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
    const assetScopeOptions = new Map<
      HistoryScopeSelection,
      HistoryScopeOption
    >();
    const liabilityScopeOptions = new Map<
      HistoryScopeSelection,
      HistoryScopeOption
    >();

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
      for (const option of point.scopeOptions.income) {
        incomeScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.expenses) {
        expenseScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.gainsLosses) {
        gainLossScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.assets) {
        assetScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.liabilities) {
        liabilityScopeOptions.set(option.value, option);
      }
      scopedMetricValues.push(point.scopedMetricValue ?? 0);
      points.push({
        periodValue: point.selectedPeriodValue,
        periodLabel: point.selectedPeriodLabel,
        periodEndDate: point.selectedPeriodEnd.toISOString(),
        totalReturn: point.totalReturn,
        savings: point.savings,
        income: point.income,
        expenses: point.expenses,
        gainsLosses: point.gainsLosses,
        assets: point.assets,
        liabilities: point.liabilities,
        netWorth: point.netWorth,
      });
    }

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
    const finalizedAssetScopeOptions = createHistoryScopeOptionsWithTotal(
      assetScopeOptions.values(),
    );
    const finalizedLiabilityScopeOptions = createHistoryScopeOptionsWithTotal(
      liabilityScopeOptions.values(),
    );
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
    const clampedAssetScope = clampHistoryScopeSelection({
      requested: data.assetScope,
      options: finalizedAssetScopeOptions,
    });
    const clampedLiabilityScope = clampHistoryScopeSelection({
      requested: data.liabilityScope,
      options: finalizedLiabilityScopeOptions,
    });
    const shouldUseScopedIncome =
      data.scopedMetric === "income" && clampedIncomeScope !== "total";
    const shouldUseScopedExpenses =
      data.scopedMetric === "expenses" && clampedExpenseScope !== "total";
    const shouldUseScopedGainLosses =
      data.scopedMetric === "gainsLosses" && clampedGainLossScope !== "total";
    const shouldUseScopedAssets =
      data.scopedMetric === "assets" && clampedAssetScope !== "total";
    const shouldUseScopedLiabilities =
      data.scopedMetric === "liabilities" && clampedLiabilityScope !== "total";
    const responsePoints = points.map((point, index) => ({
      ...point,
      income: shouldUseScopedIncome
        ? (scopedMetricValues[index] ?? 0)
        : point.income,
      expenses: shouldUseScopedExpenses
        ? (scopedMetricValues[index] ?? 0)
        : point.expenses,
      gainsLosses: shouldUseScopedGainLosses
        ? (scopedMetricValues[index] ?? 0)
        : point.gainsLosses,
      assets: shouldUseScopedAssets
        ? (scopedMetricValues[index] ?? 0)
        : point.assets,
      liabilities: shouldUseScopedLiabilities
        ? (scopedMetricValues[index] ?? 0)
        : point.liabilities,
    }));
    const { scopedMetricValue, ...baseOpeningBalancePoint } =
      openingBalancePoint;
    const responseOpeningBalancePoint = {
      ...baseOpeningBalancePoint,
      assets: shouldUseScopedAssets
        ? (scopedMetricValue ?? 0)
        : openingBalancePoint.assets,
      liabilities: shouldUseScopedLiabilities
        ? (scopedMetricValue ?? 0)
        : openingBalancePoint.liabilities,
    };

    return {
      referenceCurrency: context.referenceCurrency,
      openingBalancePoint: responseOpeningBalancePoint,
      points: responsePoints,
      scopeOptions: {
        income: finalizedIncomeScopeOptions,
        expenses: finalizedExpenseScopeOptions,
        gainsLosses: finalizedGainLossScopeOptions,
        assets: finalizedAssetScopeOptions,
        liabilities: finalizedLiabilityScopeOptions,
      },
      scopeSelection: {
        income: clampedIncomeScope,
        expenses: clampedExpenseScope,
        gainsLosses: clampedGainLossScope,
        assets: clampedAssetScope,
        liabilities: clampedLiabilityScope,
      },
    } satisfies PeriodHistoryResponse;
  });
