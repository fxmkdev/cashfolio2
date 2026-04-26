import { formatMonthPeriodValue, PERIOD_MONTH_NAMES } from "@/shared/period";

const MONTH_WINDOW_LENGTH = 6;
const YEAR_WINDOW_LENGTH = 5;

export type NetWorthTrendWindowPoint = {
  periodValue: string;
  label: string;
  isSelected: boolean;
  isInRange: boolean;
};

export type PeriodNetWorthTrendPoint = {
  periodValue: string;
  label: string;
  netWorth: number;
  isSelected: boolean;
};

type BuildNetWorthTrendWindowArgs = {
  selectedGranularity: "month" | "year";
  selectedYear: number;
  selectedMonth: number | null;
  minBookingDate: Date | null;
};

function toMonthIndex(year: number, month: number): number {
  return year * 12 + month;
}

function fromMonthIndex(monthIndex: number): { year: number; month: number } {
  const year = Math.floor(monthIndex / 12);
  return {
    year,
    month: monthIndex - year * 12,
  };
}

function formatMonthTrendLabel(year: number, month: number): string {
  const monthName = PERIOD_MONTH_NAMES[month];
  const monthShort = monthName.slice(0, 3);
  const yearShort = String(year).slice(-2);
  return `${monthShort} ${yearShort}`;
}

export function buildNetWorthTrendWindow(
  args: BuildNetWorthTrendWindowArgs,
): NetWorthTrendWindowPoint[] {
  if (args.selectedGranularity === "month") {
    const selectedMonth = args.selectedMonth ?? 0;
    const selectedMonthIndex = toMonthIndex(args.selectedYear, selectedMonth);
    const minMonthIndex = args.minBookingDate
      ? toMonthIndex(
          args.minBookingDate.getUTCFullYear(),
          args.minBookingDate.getUTCMonth(),
        )
      : null;

    return Array.from({ length: MONTH_WINDOW_LENGTH }, (_, index) => {
      const monthsBack = MONTH_WINDOW_LENGTH - 1 - index;
      const monthIndex = selectedMonthIndex - monthsBack;
      const { year, month } = fromMonthIndex(monthIndex);
      return {
        periodValue: formatMonthPeriodValue(year, month),
        label: formatMonthTrendLabel(year, month),
        isSelected: monthsBack === 0,
        isInRange: minMonthIndex == null ? true : monthIndex >= minMonthIndex,
      };
    });
  }

  const minYear = args.minBookingDate
    ? args.minBookingDate.getUTCFullYear()
    : null;

  return Array.from({ length: YEAR_WINDOW_LENGTH }, (_, index) => {
    const yearsBack = YEAR_WINDOW_LENGTH - 1 - index;
    const year = args.selectedYear - yearsBack;
    return {
      periodValue: String(year).padStart(4, "0"),
      label: String(year),
      isSelected: yearsBack === 0,
      isInRange: minYear == null ? true : year >= minYear,
    };
  });
}

export function buildPeriodNetWorthTrendPoints(args: {
  window: NetWorthTrendWindowPoint[];
  selectedNetWorth: number;
  netWorthByPeriodValue: Map<string, number>;
}): PeriodNetWorthTrendPoint[] {
  return args.window.map((point) => ({
    periodValue: point.periodValue,
    label: point.label,
    netWorth: point.isSelected
      ? args.selectedNetWorth
      : point.isInRange
        ? (args.netWorthByPeriodValue.get(point.periodValue) ?? 0)
        : 0,
    isSelected: point.isSelected,
  }));
}
