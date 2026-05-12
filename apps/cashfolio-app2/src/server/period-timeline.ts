import { createServerFn } from "@tanstack/react-start";
import { formatMonthPeriodValue } from "../shared/period";
import { startOfUtcDay } from "../shared/date";
import type { TimelineOpeningBalancePoint } from "./period-timeline-opening-balance.server";
import {
  isTimelineScopedMetric,
  parseTimelineScopeSelection,
  type TimelineScopeOption,
  type TimelineScopeSelection,
  type TimelineScopedMetric,
} from "../shared/timeline-scope";

export type PeriodTimelineGranularity = "month" | "year";

export type PeriodTimelinePoint = {
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

export type PeriodTimelineOpeningBalancePoint = TimelineOpeningBalancePoint;

export type PeriodTimelineResponse = {
  referenceCurrency: string;
  openingBalancePoint: PeriodTimelineOpeningBalancePoint;
  points: PeriodTimelinePoint[];
  scopeOptions: {
    income: TimelineScopeOption[];
    expenses: TimelineScopeOption[];
    assets: TimelineScopeOption[];
    liabilities: TimelineScopeOption[];
  };
  scopeSelection: {
    income: TimelineScopeSelection;
    expenses: TimelineScopeSelection;
    assets: TimelineScopeSelection;
    liabilities: TimelineScopeSelection;
  };
};

type TimelineInput = {
  accountBookId: string;
  granularity: PeriodTimelineGranularity;
  scopedMetric?: TimelineScopedMetric;
  incomeScope: TimelineScopeSelection;
  expenseScope: TimelineScopeSelection;
  assetScope: TimelineScopeSelection;
  liabilityScope: TimelineScopeSelection;
};

function toMonthIndex(year: number, month: number): number {
  return year * 12 + month;
}

function parseTimelineGranularity(value: unknown): PeriodTimelineGranularity {
  if (value === "month" || value === "year") {
    return value;
  }

  throw new Response("Invalid timeline granularity. Use month or year.", {
    status: 400,
  });
}

function parseOptionalTimelineScopedMetric(
  value: unknown,
): TimelineScopedMetric | undefined {
  return isTimelineScopedMetric(value) ? value : undefined;
}

function parseTimelineScopeSelectionOrDefault(
  value: unknown,
): TimelineScopeSelection {
  return parseTimelineScopeSelection(value) ?? "total";
}

function createTimelineScopeOptionsWithTotal(
  options: Iterable<TimelineScopeOption>,
): TimelineScopeOption[] {
  const optionByValue = new Map<TimelineScopeSelection, TimelineScopeOption>();
  for (const option of options) {
    optionByValue.set(option.value, option);
  }

  const sortedOptions = Array.from(optionByValue.values()).toSorted(
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

function clampTimelineScopeSelection(args: {
  requested: TimelineScopeSelection;
  options: TimelineScopeOption[];
}): TimelineScopeSelection {
  if (args.options.some((option) => option.value === args.requested)) {
    return args.requested;
  }

  return "total";
}

export function buildTimelinePeriodValues(args: {
  granularity: PeriodTimelineGranularity;
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

export const getPeriodTimeline = createServerFn({
  method: "GET",
})
  .inputValidator(
    (data: {
      accountBookId: string;
      granularity: unknown;
      scopedMetric?: unknown;
      incomeScope?: unknown;
      expenseScope?: unknown;
      assetScope?: unknown;
      liabilityScope?: unknown;
    }): TimelineInput => ({
      accountBookId: data.accountBookId,
      granularity: parseTimelineGranularity(data.granularity),
      scopedMetric: parseOptionalTimelineScopedMetric(data.scopedMetric),
      incomeScope: parseTimelineScopeSelectionOrDefault(data.incomeScope),
      expenseScope: parseTimelineScopeSelectionOrDefault(data.expenseScope),
      assetScope: parseTimelineScopeSelectionOrDefault(data.assetScope),
      liabilityScope: parseTimelineScopeSelectionOrDefault(data.liabilityScope),
    }),
  )
  .handler(async ({ data }) => {
    const { ensureAuthorizedForAccountBookId } =
      await import("../account-books/functions.server");
    const { loadPeriodTimelinePoint, loadPeriodTimelinePointContext } =
      await import("./period-timeline-point.server");
    const { loadTimelineOpeningBalancePoint } =
      await import("./period-timeline-opening-balance.server");
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const context = await loadPeriodTimelinePointContext({
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
    const openingBalancePoint = await loadTimelineOpeningBalancePoint({
      accountBookId: data.accountBookId,
      accountBookStartDate: context.accountBookStartDate,
      referenceCurrency: context.referenceCurrency,
      metricScopeFilter: activeMetricScopeFilter,
    });

    const periodValues = buildTimelinePeriodValues({
      granularity: data.granularity,
      minDate: context.accountBookStartDate,
      maxDate: new Date(),
    });

    const points: PeriodTimelinePoint[] = [];
    const scopedMetricValues: number[] = [];
    const incomeScopeOptions = new Map<
      TimelineScopeSelection,
      TimelineScopeOption
    >();
    const expenseScopeOptions = new Map<
      TimelineScopeSelection,
      TimelineScopeOption
    >();
    const assetScopeOptions = new Map<
      TimelineScopeSelection,
      TimelineScopeOption
    >();
    const liabilityScopeOptions = new Map<
      TimelineScopeSelection,
      TimelineScopeOption
    >();
    for (const periodValue of periodValues) {
      const point = await loadPeriodTimelinePoint({
        accountBookId: data.accountBookId,
        period: periodValue,
        context,
        metricScopeFilter: activeMetricScopeFilter,
      });
      for (const option of point.scopeOptions.income) {
        incomeScopeOptions.set(option.value, option);
      }
      for (const option of point.scopeOptions.expenses) {
        expenseScopeOptions.set(option.value, option);
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

    const finalizedIncomeScopeOptions = createTimelineScopeOptionsWithTotal(
      incomeScopeOptions.values(),
    );
    const finalizedExpenseScopeOptions = createTimelineScopeOptionsWithTotal(
      expenseScopeOptions.values(),
    );
    const finalizedAssetScopeOptions = createTimelineScopeOptionsWithTotal(
      assetScopeOptions.values(),
    );
    const finalizedLiabilityScopeOptions = createTimelineScopeOptionsWithTotal(
      liabilityScopeOptions.values(),
    );
    const clampedIncomeScope = clampTimelineScopeSelection({
      requested: data.incomeScope,
      options: finalizedIncomeScopeOptions,
    });
    const clampedExpenseScope = clampTimelineScopeSelection({
      requested: data.expenseScope,
      options: finalizedExpenseScopeOptions,
    });
    const clampedAssetScope = clampTimelineScopeSelection({
      requested: data.assetScope,
      options: finalizedAssetScopeOptions,
    });
    const clampedLiabilityScope = clampTimelineScopeSelection({
      requested: data.liabilityScope,
      options: finalizedLiabilityScopeOptions,
    });
    const shouldUseScopedIncome =
      data.scopedMetric === "income" && clampedIncomeScope !== "total";
    const shouldUseScopedExpenses =
      data.scopedMetric === "expenses" && clampedExpenseScope !== "total";
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
        assets: finalizedAssetScopeOptions,
        liabilities: finalizedLiabilityScopeOptions,
      },
      scopeSelection: {
        income: clampedIncomeScope,
        expenses: clampedExpenseScope,
        assets: clampedAssetScope,
        liabilities: clampedLiabilityScope,
      },
    } satisfies PeriodTimelineResponse;
  });
