import { parseISO } from "date-fns";

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function getUtcDayRange(date: Date): {
  start: Date;
  endExclusive: Date;
} {
  const start = startOfUtcDay(date);
  return {
    start,
    endExclusive: new Date(start.getTime() + MILLISECONDS_PER_DAY),
  };
}

export function getOpeningBalancesBookingDate(
  accountBookStartDate: Date,
): Date {
  const startDate = startOfUtcDay(accountBookStartDate);
  return new Date(startDate.getTime() - MILLISECONDS_PER_DAY);
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function normalizeDateInputValue(
  value: Date | string | null | undefined,
): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const swissDateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (swissDateMatch) {
    const day = Number(swissDateMatch[1]);
    const month = Number(swissDateMatch[2]);
    const year = Number(swissDateMatch[3]);
    return createUtcDateFromParts({ year, month, day });
  }

  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]);
    const day = Number(isoDateMatch[3]);
    return createUtcDateFromParts({ year, month, day });
  }

  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      trimmed,
    )
  ) {
    const parsed = parseISO(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function createUtcDateFromParts(args: {
  year: number;
  month: number;
  day: number;
}): Date | null {
  const result = new Date(Date.UTC(args.year, args.month - 1, args.day));
  const isExactMatch =
    result.getUTCFullYear() === args.year &&
    result.getUTCMonth() === args.month - 1 &&
    result.getUTCDate() === args.day;

  return isExactMatch ? result : null;
}
