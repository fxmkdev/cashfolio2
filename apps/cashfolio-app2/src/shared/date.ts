import { parse } from "date-fns";

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

  const parsedFromDisplayFormat = parse(trimmed, "dd.MM.yyyy", new Date());
  if (!isNaN(parsedFromDisplayFormat.getTime())) {
    return parsedFromDisplayFormat;
  }

  const parsedWithNativeDate = new Date(trimmed);
  return isNaN(parsedWithNativeDate.getTime()) ? null : parsedWithNativeDate;
}
