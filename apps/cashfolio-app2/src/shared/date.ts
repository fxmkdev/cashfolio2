import { parseISO } from "date-fns";
import { DEFAULT_USER_LOCALE } from "@/user-locale";

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY);
}

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

export function formatUtcDateForLocale(
  date: Date,
  locale = DEFAULT_USER_LOCALE,
): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function getDateInputValueFormat(locale = DEFAULT_USER_LOCALE): string {
  return getLocaleDateParts(locale)
    .map((part) => {
      if (part.type === "day") return "DD";
      if (part.type === "month") return "MM";
      if (part.type === "year") return "YYYY";
      return part.value;
    })
    .join("");
}

export function normalizeDateInputValue(
  value: Date | string | null | undefined,
  locale = DEFAULT_USER_LOCALE,
): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const localizedDate = parseLocalizedDateInputValue(trimmed, locale);
  if (localizedDate) {
    return localizedDate;
  }

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

function getLocaleDateParts(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(2006, 10, 22)));
}

function parseLocalizedDateInputValue(value: string, locale: string) {
  const dateParts = getLocaleDateParts(locale).filter(
    (part) =>
      part.type === "day" || part.type === "month" || part.type === "year",
  );
  const match = /^(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})$/.exec(value);
  if (!match || dateParts.length !== 3) {
    return null;
  }

  const resolved: Partial<Record<"day" | "month" | "year", number>> = {};
  for (let index = 0; index < dateParts.length; index += 1) {
    const part = dateParts[index];
    const rawValue = match[index + 1];
    if (!part || !rawValue) {
      return null;
    }

    resolved[part.type as "day" | "month" | "year"] = Number(rawValue);
  }

  if (!resolved.day || !resolved.month || !resolved.year) {
    return null;
  }

  return createUtcDateFromParts({
    day: resolved.day,
    month: resolved.month,
    year: resolved.year,
  });
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
