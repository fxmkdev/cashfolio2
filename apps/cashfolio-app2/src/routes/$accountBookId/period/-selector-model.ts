import { formatMonthPeriodValue } from "@/shared/period";

export type PeriodMode = "month" | "year";

export type MonthBounds = { minMonth: number; maxMonth: number };

export function getMonthBoundsForYear(args: {
  year: number;
  minBookingDate: Date | null;
  maxDate: Date;
}): MonthBounds {
  const { year, minBookingDate, maxDate } = args;

  let minMonth = 0;
  let maxMonth = 11;

  if (minBookingDate) {
    if (minBookingDate.getUTCFullYear() === year) {
      minMonth = minBookingDate.getUTCMonth();
    }
  } else if (maxDate.getUTCFullYear() === year) {
    minMonth = maxDate.getUTCMonth();
  }

  if (maxDate.getUTCFullYear() === year) {
    maxMonth = maxDate.getUTCMonth();
  }

  return {
    minMonth,
    maxMonth,
  };
}

export function getYearBounds(args: {
  minBookingDate: Date | null;
  maxDate: Date;
}): { minYear: number; maxYear: number } {
  return {
    minYear: args.minBookingDate
      ? args.minBookingDate.getUTCFullYear()
      : args.maxDate.getUTCFullYear(),
    maxYear: args.maxDate.getUTCFullYear(),
  };
}

export function toMonthIndex(year: number, month: number): number {
  return year * 12 + month;
}

export function fromMonthIndex(monthIndex: number): {
  year: number;
  month: number;
} {
  return {
    year: Math.floor(monthIndex / 12),
    month: monthIndex % 12,
  };
}

function toPickerMonthDate(year: number, month: number): Date {
  return new Date(year, month, 1, 12);
}

function toPickerYearDate(year: number): Date {
  return new Date(year, 0, 1, 12);
}

export type PeriodSelectorModel = {
  periodMode: PeriodMode;
  selectedMonth: number;
  selectedMonthIndex: number;
  minMonthIndex: number;
  maxMonthIndex: number;
  minYear: number;
  maxYear: number;
  selectedYearMonthBounds: MonthBounds;
  canGoToPreviousPeriod: boolean;
  canGoToNextPeriod: boolean;
  minMonthPickerDate: Date;
  maxMonthPickerDate: Date;
  minYearPickerDate: Date;
  maxYearPickerDate: Date;
};

export function buildPeriodSelectorModel(args: {
  selectedGranularity: PeriodMode;
  selectedYear: number;
  selectedMonth: number | null;
  minBookingDate: Date | null;
  maxDate: Date;
}): PeriodSelectorModel {
  const periodMode: PeriodMode = args.selectedGranularity;
  const currentYear = args.maxDate.getUTCFullYear();
  const currentMonth = args.maxDate.getUTCMonth();
  const minMonthYear = args.minBookingDate
    ? args.minBookingDate.getUTCFullYear()
    : currentYear;
  const minMonthValue = args.minBookingDate
    ? args.minBookingDate.getUTCMonth()
    : currentMonth;
  const minMonthIndex = toMonthIndex(minMonthYear, minMonthValue);
  const maxMonthIndex = toMonthIndex(currentYear, currentMonth);
  const { minYear, maxYear } = getYearBounds({
    minBookingDate: args.minBookingDate,
    maxDate: args.maxDate,
  });
  const selectedYearMonthBounds = getMonthBoundsForYear({
    year: args.selectedYear,
    minBookingDate: args.minBookingDate,
    maxDate: args.maxDate,
  });
  const selectedMonth =
    periodMode === "month" && args.selectedMonth != null
      ? args.selectedMonth
      : selectedYearMonthBounds.maxMonth;
  const selectedMonthIndex = toMonthIndex(args.selectedYear, selectedMonth);

  return {
    periodMode,
    selectedMonth,
    selectedMonthIndex,
    minMonthIndex,
    maxMonthIndex,
    minYear,
    maxYear,
    selectedYearMonthBounds,
    canGoToPreviousPeriod:
      periodMode === "month"
        ? selectedMonthIndex > minMonthIndex
        : args.selectedYear > minYear,
    canGoToNextPeriod:
      periodMode === "month"
        ? selectedMonthIndex < maxMonthIndex
        : args.selectedYear < maxYear,
    minMonthPickerDate: toPickerMonthDate(minMonthYear, minMonthValue),
    maxMonthPickerDate: toPickerMonthDate(currentYear, currentMonth),
    minYearPickerDate: toPickerYearDate(minYear),
    maxYearPickerDate: toPickerYearDate(maxYear),
  };
}

export function getPeriodModeChangeValue(args: {
  nextMode: string;
  periodMode: PeriodMode;
  selectedYear: number;
  selectedYearMaxMonth: number;
}): string | null {
  if (args.nextMode !== "month" && args.nextMode !== "year") {
    return null;
  }

  if (args.nextMode === args.periodMode) {
    return null;
  }

  if (args.nextMode === "year") {
    return String(args.selectedYear);
  }

  return formatMonthPeriodValue(args.selectedYear, args.selectedYearMaxMonth);
}

export function getPeriodStepValue(args: {
  periodMode: PeriodMode;
  step: -1 | 1;
  selectedMonthIndex: number;
  minMonthIndex: number;
  maxMonthIndex: number;
  selectedYear: number;
  minYear: number;
  maxYear: number;
}): string | null {
  if (args.periodMode === "month") {
    const nextMonthIndex = Math.min(
      Math.max(args.selectedMonthIndex + args.step, args.minMonthIndex),
      args.maxMonthIndex,
    );

    if (nextMonthIndex === args.selectedMonthIndex) {
      return null;
    }

    const { year, month } = fromMonthIndex(nextMonthIndex);
    return formatMonthPeriodValue(year, month);
  }

  const nextYear = Math.min(
    Math.max(args.selectedYear + args.step, args.minYear),
    args.maxYear,
  );
  if (nextYear === args.selectedYear) {
    return null;
  }
  return String(nextYear);
}

export function getMonthPickerValue(nextValue: string | null): string | null {
  if (!nextValue) {
    return null;
  }
  const [yearText, monthText] = nextValue.split("-");
  const year = Number(yearText);
  const monthOneBased = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthOneBased)) {
    return null;
  }
  if (monthOneBased < 1 || monthOneBased > 12) {
    return null;
  }
  return formatMonthPeriodValue(year, monthOneBased - 1);
}

export function getYearPickerValue(nextValue: string | null): string | null {
  if (!nextValue) {
    return null;
  }
  const [yearText] = nextValue.split("-");
  const year = Number(yearText);
  if (!Number.isFinite(year)) {
    return null;
  }
  return String(year);
}
