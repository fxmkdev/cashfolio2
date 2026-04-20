import { format, parse, parseISO } from "date-fns";

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

  const acceptedFormats: Array<{
    matches: (input: string) => boolean;
    parse: (input: string) => Date;
    normalize?: (parsed: Date) => string;
  }> = [
    {
      matches: (input) => /^\d{2}\.\d{2}\.\d{4}$/.test(input),
      parse: (input) => parse(input, "dd.MM.yyyy", new Date()),
      normalize: (parsed) => format(parsed, "dd.MM.yyyy"),
    },
    {
      matches: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input),
      parse: (input) => parse(input, "yyyy-MM-dd", new Date()),
      normalize: (parsed) => format(parsed, "yyyy-MM-dd"),
    },
    {
      matches: (input) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
          input,
        ),
      parse: (input) => parseISO(input),
    },
  ];

  for (const format of acceptedFormats) {
    if (!format.matches(trimmed)) continue;

    const parsed = format.parse(trimmed);
    if (!isNaN(parsed.getTime())) {
      if (format.normalize && format.normalize(parsed) !== trimmed) {
        return null;
      }
      return parsed;
    }
  }

  return null;
}
