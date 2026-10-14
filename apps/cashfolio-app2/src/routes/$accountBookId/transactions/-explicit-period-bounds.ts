import { formatMonthPeriodValue } from "@/shared/period";
import {
  getYearBounds,
  getMonthBoundsForYear,
} from "@/shared/period-selector-model";
import type { parseTransactionsExplicitPeriod } from "./-page-types";

export function clampTransactionsExplicitPeriodToBounds(args: {
  selectedPeriod: NonNullable<
    ReturnType<typeof parseTransactionsExplicitPeriod>
  >;
  minBookingDate: Date | null;
  maxDate: Date;
}): string {
  const { selectedPeriod, minBookingDate, maxDate } = args;
  const { minYear, maxYear } = getYearBounds({ minBookingDate, maxDate });
  const clampedYear = Math.min(Math.max(selectedPeriod.year, minYear), maxYear);

  if (selectedPeriod.granularity === "year") {
    return String(clampedYear).padStart(4, "0");
  }

  const { minMonth, maxMonth } = getMonthBoundsForYear({
    year: clampedYear,
    minBookingDate,
    maxDate,
  });
  const clampedMonth = Math.min(
    Math.max(selectedPeriod.month ?? maxMonth, minMonth),
    maxMonth,
  );

  return formatMonthPeriodValue(clampedYear, clampedMonth);
}
