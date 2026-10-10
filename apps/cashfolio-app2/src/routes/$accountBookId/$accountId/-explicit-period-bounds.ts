import { formatMonthPeriodValue } from "@/shared/period";
import {
  fromMonthIndex,
  toMonthIndex,
  getYearBounds,
} from "@/shared/period-selector-model";
import type { parseLedgerExplicitPeriod } from "./-page-types";

export function clampLedgerExplicitPeriodToBounds(args: {
  selectedPeriod: NonNullable<ReturnType<typeof parseLedgerExplicitPeriod>>;
  minBookingDate: Date | null;
  maxDate: Date;
}): string {
  const { selectedPeriod, minBookingDate, maxDate } = args;
  const { minYear, maxYear } = getYearBounds({ minBookingDate, maxDate });
  const clampedYear = Math.min(Math.max(selectedPeriod.year, minYear), maxYear);

  if (selectedPeriod.granularity === "year") {
    return String(clampedYear).padStart(4, "0");
  }

  const minMonthIndex = minBookingDate
    ? toMonthIndex(
        minBookingDate.getUTCFullYear(),
        minBookingDate.getUTCMonth(),
      )
    : toMonthIndex(maxDate.getUTCFullYear(), maxDate.getUTCMonth());
  const maxMonthIndex = toMonthIndex(
    maxDate.getUTCFullYear(),
    maxDate.getUTCMonth(),
  );
  const selectedMonthIndex = toMonthIndex(
    selectedPeriod.year,
    selectedPeriod.month ?? maxDate.getUTCMonth(),
  );
  const { year, month } = fromMonthIndex(
    Math.min(Math.max(selectedMonthIndex, minMonthIndex), maxMonthIndex),
  );
  return formatMonthPeriodValue(year, month);
}
