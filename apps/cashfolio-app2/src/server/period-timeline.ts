import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import { formatMonthPeriodValue } from "../shared/period";
import { startOfUtcDay } from "../shared/date";
import { getPeriodOverview } from "./period";

export type PeriodTimelineGranularity = "month" | "year";

export type PeriodTimelinePoint = {
  periodValue: string;
  periodLabel: string;
  totalReturn: number;
};

export type PeriodTimelineResponse = {
  referenceCurrency: string;
  points: PeriodTimelinePoint[];
};

type TimelineInput = {
  accountBookId: string;
  granularity: PeriodTimelineGranularity;
};

const TIMELINE_CONCURRENCY_LIMIT = 4;

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

async function mapWithConcurrencyLimit<TInput, TOutput>(
  items: readonly TInput[],
  concurrencyLimit: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  const workerCount = Math.min(Math.max(1, concurrencyLimit), items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
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
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    });

    const periodValues = buildTimelinePeriodValues({
      granularity: data.granularity,
      minDate: accountBook.startDate,
      maxDate: new Date(),
    });

    const points = await mapWithConcurrencyLimit(
      periodValues,
      TIMELINE_CONCURRENCY_LIMIT,
      async (periodValue) => {
        const overview = await getPeriodOverview({
          data: {
            accountBookId: data.accountBookId,
            period: periodValue,
          },
        });

        return {
          periodValue: overview.selectedPeriodValue,
          periodLabel: overview.selectedPeriodLabel,
          totalReturn: overview.stats.totalReturn,
        } satisfies PeriodTimelinePoint;
      },
    );

    return {
      referenceCurrency: accountBook.referenceCurrency.toUpperCase(),
      points,
    } satisfies PeriodTimelineResponse;
  });
