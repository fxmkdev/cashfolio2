import { Temporal } from "./temporal";
import {
  fromLocalPlainDate,
  fromUtcPlainDate,
  toLocalPlainDate,
  toTemporalInstant,
  toUtcPlainDate,
} from "./temporal-adapters";
import { DEFAULT_USER_LOCALE } from "@/user-locale";

export function startOfUtcDay(date: Date): Date {
  return Number.isFinite(date.getTime())
    ? fromUtcPlainDate(toUtcPlainDate(date))
    : new Date(NaN);
}

export function startOfUtcMonth(date: Date): Date {
  return Number.isFinite(date.getTime())
    ? fromUtcPlainDate(toUtcPlainDate(date).with({ day: 1 }))
    : new Date(NaN);
}

export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function addUtcDays(date: Date, days: number): Date {
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(days)) {
    return new Date(NaN);
  }
  // Preserve the time of day: these legacy helpers also accept instants.
  return new Date(
    toTemporalInstant(date)
      .toZonedDateTimeISO("UTC")
      .add(
        Number.isInteger(days)
          ? { days }
          : { milliseconds: Math.trunc(days * MILLISECONDS_PER_DAY) },
      ).epochMilliseconds,
  );
}

export function getUtcDayRange(date: Date): {
  start: Date;
  endExclusive: Date;
} {
  const start = startOfUtcDay(date);
  return { start, endExclusive: addUtcDays(start, 1) };
}

export function getOpeningBalancesBookingDate(
  accountBookStartDate: Date,
): Date {
  return addUtcDays(startOfUtcDay(accountBookStartDate), -1);
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
    ? toUtcPlainDate(a).equals(toUtcPlainDate(b))
    : false;
}

export function formatUtcDate(date: Date): string {
  return toUtcPlainDate(date).toString();
}

export function startOfLocalDay(date: Date): Date {
  return fromLocalPlainDate(toLocalPlainDate(date));
}

export function isSameLocalDay(a: Date | string, b: Date | string): boolean {
  const left = a instanceof Date ? a : new Date(a);
  const right = b instanceof Date ? b : new Date(b);
  return Number.isFinite(left.getTime()) && Number.isFinite(right.getTime())
    ? toLocalPlainDate(left).equals(toLocalPlainDate(right))
    : false;
}

export function isBeforeDate(a: Date, b: Date): boolean {
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
    ? Temporal.Instant.compare(toTemporalInstant(a), toTemporalInstant(b)) < 0
    : false;
}

export function earliestDate(dates: Date[]): Date {
  if (!dates.length || dates.some((date) => !Number.isFinite(date.getTime()))) {
    return new Date(NaN);
  }
  return new Date(
    dates.reduce((first, date) => (isBeforeDate(date, first) ? date : first)),
  );
}

/** Preserve the existing fixed local-calendar display used by source details. */
export function formatLocalDate(date: Date): string {
  const day = toLocalPlainDate(date);
  return `${String(day.day).padStart(2, "0")}.${String(day.month).padStart(2, "0")}.${String(day.year).padStart(4, "0")}`;
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

  const instantMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      trimmed,
    );
  if (instantMatch) {
    return parseDateTimeInput(instantMatch);
  }

  return null;
}

export function normalizeDateInputValueToUtcDay(
  value: Date | string | null | undefined,
  locale = DEFAULT_USER_LOCALE,
): Date | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const utcDay = startOfUtcDay(value);
    if (value.getTime() === utcDay.getTime()) return utcDay;

    return fromUtcPlainDate(toLocalPlainDate(value));
  }

  const normalized = normalizeDateInputValue(value, locale);
  return normalized ? startOfUtcDay(normalized) : null;
}

export function formatDateInputValueAsUtcDayIsoString(
  value: Date | string | null | undefined,
  locale = DEFAULT_USER_LOCALE,
): string {
  return normalizeDateInputValueToUtcDay(value, locale)?.toISOString() ?? "";
}

export function createDateInputValueFromUtcDay(
  value: Date | string | null | undefined,
): Date | null {
  const utcDay =
    value instanceof Date
      ? startOfUtcDay(value)
      : normalizeDateInputValueToUtcDay(value);
  if (!utcDay || isNaN(utcDay.getTime())) return null;
  return fromLocalPlainDate(toUtcPlainDate(utcDay));
}

export function parseUtcDayDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const utcDay = startOfUtcDay(value);
    return value.getTime() === utcDay.getTime() ? utcDay : null;
  }

  const trimmed = value.trim();
  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDateMatch) {
    return createUtcDateFromParts({
      year: Number(isoDateMatch[1]),
      month: Number(isoDateMatch[2]),
      day: Number(isoDateMatch[3]),
    });
  }

  const canonicalUtcDayMatch = /^(\d{4})-(\d{2})-(\d{2})T00:00:00\.000Z$/.exec(
    trimmed,
  );
  if (canonicalUtcDayMatch) {
    return createUtcDateFromParts({
      year: Number(canonicalUtcDayMatch[1]),
      month: Number(canonicalUtcDayMatch[2]),
      day: Number(canonicalUtcDayMatch[3]),
    });
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

export function createUtcDateFromParts(args: {
  year: number;
  month: number;
  day: number;
}): Date | null {
  // Date.UTC historically rejected years 0000–0099 in this parser because it
  // interprets them as 1900–1999. Keep the accepted input range unchanged.
  if (args.year < 100 || !Object.values(args).every(Number.isInteger))
    return null;
  try {
    return fromUtcPlainDate(
      Temporal.PlainDate.from(args, { overflow: "reject" }),
    );
  } catch {
    return null;
  }
}

/** Keep the legacy ISO input grammar, including 24:00 and offset conversion. */
function parseDateTimeInput(match: RegExpExecArray): Date | null {
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  const offsetMinute = Number(match[11] ?? 0);
  if (offsetMinute > 59) return null;
  try {
    let day = Temporal.PlainDate.from(
      {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      },
      { overflow: "reject" },
    );
    if (hour === 24) {
      if (minute || second || millisecond) return null;
      day = day.add({ days: 1 });
      hour = 0;
    }
    const time = Temporal.PlainTime.from(
      { hour, minute, second, millisecond },
      { overflow: "reject" },
    );
    const offset =
      (Number(match[10] ?? 0) * 60 + offsetMinute) *
      (match[9] === "-" ? -1 : 1);
    return new Date(
      day
        .toPlainDateTime(time)
        .toZonedDateTime("UTC")
        .toInstant()
        .subtract({ minutes: offset }).epochMilliseconds,
    );
  } catch {
    return null;
  }
}
