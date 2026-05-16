import {
  DEFAULT_PERIOD_VALUE,
  formatMonthPeriodValue,
  formatMonthPeriodLabel,
  normalizePeriodValue,
  parseExplicitMonthPeriod,
  parseExplicitYearPeriod,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
  type PeriodPresetValue,
} from "../../shared/period";
import { addUtcDays, startOfUtcDay } from "../../shared/date";
import { DEFAULT_USER_LOCALE, type UserLocale } from "../../user-locale";

export type PeriodSpecifier = PeriodPresetValue | "month" | "year";

type NormalizedPeriodBase = {
  granularity: "month" | "year";
  periodSpecifier: PeriodSpecifier;
  year: number;
  month: number | null;
};

export type NormalizedPeriodSelection = NormalizedPeriodBase & {
  periodValue: string;
  from: Date;
  to: Date;
  label: string;
};

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

function endOfUtcYear(year: number): Date {
  return new Date(Date.UTC(year, 12, 0));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function normalizePeriodBase(args: {
  periodValue: string;
  now: Date;
}): NormalizedPeriodBase {
  const { periodValue, now } = args;
  const currentMonthStart = startOfUtcMonth(now);

  if (periodValue === PERIOD_PRESET_MTD) {
    return {
      granularity: "month",
      periodSpecifier: PERIOD_PRESET_MTD,
      year: currentMonthStart.getUTCFullYear(),
      month: currentMonthStart.getUTCMonth(),
    };
  }

  if (periodValue === PERIOD_PRESET_LAST_MONTH) {
    const lastMonthStart = addUtcMonths(currentMonthStart, -1);
    return {
      granularity: "month",
      periodSpecifier: PERIOD_PRESET_LAST_MONTH,
      year: lastMonthStart.getUTCFullYear(),
      month: lastMonthStart.getUTCMonth(),
    };
  }

  if (periodValue === PERIOD_PRESET_YTD) {
    return {
      granularity: "year",
      periodSpecifier: PERIOD_PRESET_YTD,
      year: currentMonthStart.getUTCFullYear(),
      month: null,
    };
  }

  if (periodValue === PERIOD_PRESET_LAST_YEAR) {
    return {
      granularity: "year",
      periodSpecifier: PERIOD_PRESET_LAST_YEAR,
      year: currentMonthStart.getUTCFullYear() - 1,
      month: null,
    };
  }

  const explicitMonth = parseExplicitMonthPeriod(periodValue);
  if (explicitMonth) {
    return {
      granularity: "month",
      periodSpecifier: "month",
      year: explicitMonth.year,
      month: explicitMonth.month,
    };
  }

  const explicitYear = parseExplicitYearPeriod(periodValue);
  if (explicitYear) {
    return {
      granularity: "year",
      periodSpecifier: "year",
      year: explicitYear.year,
      month: null,
    };
  }

  return normalizePeriodBase({ periodValue: DEFAULT_PERIOD_VALUE, now });
}

function clampExplicitSelectionToBounds(args: {
  base: NormalizedPeriodBase;
  now: Date;
  firstBookingDate: Date | null | undefined;
}): NormalizedPeriodBase {
  const { base, now, firstBookingDate } = args;

  if (base.periodSpecifier !== "month" && base.periodSpecifier !== "year") {
    return base;
  }

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const hasNoBookings = firstBookingDate === null;
  const firstBookingDay = firstBookingDate
    ? startOfUtcDay(firstBookingDate)
    : null;

  if (base.granularity === "month") {
    const month = base.month ?? 0;
    const monthIndex = base.year * 12 + month;
    const minMonthIndex = firstBookingDay
      ? firstBookingDay.getUTCFullYear() * 12 + firstBookingDay.getUTCMonth()
      : hasNoBookings
        ? currentYear * 12 + currentMonth
        : monthIndex;
    const maxMonthIndex = currentYear * 12 + currentMonth;

    const clampedMonthIndex = Math.min(
      Math.max(monthIndex, minMonthIndex),
      maxMonthIndex,
    );
    const clampedYear = Math.floor(clampedMonthIndex / 12);
    const clampedMonth = clampedMonthIndex % 12;

    return {
      ...base,
      year: clampedYear,
      month: clampedMonth,
    };
  }

  const minYear = firstBookingDay
    ? firstBookingDay.getUTCFullYear()
    : hasNoBookings
      ? currentYear
      : base.year;
  return {
    ...base,
    year: Math.min(Math.max(base.year, minYear), currentYear),
  };
}

function buildPeriodLabel(
  base: NormalizedPeriodBase,
  locale: UserLocale = DEFAULT_USER_LOCALE,
): string {
  if (base.granularity === "month") {
    const month = base.month ?? 0;
    return formatMonthPeriodLabel(base.year, month, locale);
  }

  return String(base.year);
}

export function resolvePeriodSelection(args: {
  periodValue: string;
  now?: Date;
  firstBookingDate?: Date | null;
  locale?: UserLocale;
}): NormalizedPeriodSelection {
  const now = startOfUtcDay(args.now ?? new Date());
  const normalizedPeriodValue = normalizePeriodValue(args.periodValue);
  const firstBookingDateForClamping =
    args.firstBookingDate === undefined
      ? undefined
      : args.firstBookingDate
        ? startOfUtcDay(args.firstBookingDate)
        : null;
  const base = clampExplicitSelectionToBounds({
    base: normalizePeriodBase({ periodValue: normalizedPeriodValue, now }),
    now,
    firstBookingDate: firstBookingDateForClamping,
  });

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const firstBookingDate = firstBookingDateForClamping ?? null;

  const year = base.year;
  const month = base.month;

  let from: Date;
  let to: Date;

  if (base.granularity === "month") {
    const monthIndex = month ?? 0;
    from = new Date(Date.UTC(year, monthIndex, 1));
    const isCurrentMonth = year === currentYear && monthIndex === currentMonth;
    to = isCurrentMonth ? addUtcDays(now, -1) : endOfUtcMonth(year, monthIndex);
  } else {
    const startMonth =
      firstBookingDate && year === firstBookingDate.getUTCFullYear()
        ? firstBookingDate.getUTCMonth()
        : 0;
    from = new Date(Date.UTC(year, startMonth, 1));
    const isCurrentYear = year === currentYear;
    to = isCurrentYear ? addUtcDays(now, -1) : endOfUtcYear(year);
  }

  if (to < from) {
    to = from;
  }

  const periodValue =
    base.granularity === "month"
      ? formatMonthPeriodValue(base.year, base.month ?? 0)
      : String(base.year).padStart(4, "0");

  return {
    periodValue:
      base.periodSpecifier === "month" || base.periodSpecifier === "year"
        ? periodValue
        : base.periodSpecifier,
    periodSpecifier: base.periodSpecifier,
    granularity: base.granularity,
    year: base.year,
    month: base.granularity === "month" ? (base.month ?? 0) : null,
    from,
    to,
    label: buildPeriodLabel(base, args.locale),
  };
}

export function getPeriodEndExclusive(periodEnd: Date): Date {
  return addUtcDays(startOfUtcDay(periodEnd), 1);
}
