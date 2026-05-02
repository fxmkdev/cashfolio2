import { createServerFn } from "@tanstack/react-start";
import { formatMonthPeriodValue } from "../shared/period";
import { startOfUtcDay } from "../shared/date";

export type PeriodTimelineGranularity = "month" | "year";

export type PeriodTimelinePoint = {
  periodValue: string;
  periodLabel: string;
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type PeriodTimelineOpeningBalancePoint = {
  date: string;
  label: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type PeriodTimelineResponse = {
  referenceCurrency: string;
  openingBalancePoint: PeriodTimelineOpeningBalancePoint;
  points: PeriodTimelinePoint[];
};

type TimelineInput = {
  accountBookId: string;
  granularity: PeriodTimelineGranularity;
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
    (data: { accountBookId: string; granularity: unknown }): TimelineInput => ({
      accountBookId: data.accountBookId,
      granularity: parseTimelineGranularity(data.granularity),
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
    const openingBalancePoint = await loadTimelineOpeningBalancePoint({
      accountBookId: data.accountBookId,
      accountBookStartDate: context.accountBookStartDate,
      referenceCurrency: context.referenceCurrency,
    });

    const periodValues = buildTimelinePeriodValues({
      granularity: data.granularity,
      minDate: context.accountBookStartDate,
      maxDate: new Date(),
    });

    const points: PeriodTimelinePoint[] = [];
    for (const periodValue of periodValues) {
      const point = await loadPeriodTimelinePoint({
        accountBookId: data.accountBookId,
        period: periodValue,
        context,
      });
      points.push({
        periodValue: point.selectedPeriodValue,
        periodLabel: point.selectedPeriodLabel,
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

    return {
      referenceCurrency: context.referenceCurrency,
      openingBalancePoint,
      points,
    } satisfies PeriodTimelineResponse;
  });
