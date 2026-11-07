import { startOfUtcDay } from "../../shared/date";
import { type Money, type MoneyInput, moneyRound2 } from "../../shared/money";

export { buildPeriodEndAllocationBreakdown } from "./breakdown/period-allocation-breakdown";
export {
  buildBreakdownItems,
  createBreakdownBucket,
} from "./breakdown/period-breakdown-buckets";
export {
  buildBreakdownHierarchy,
  buildBreakdownHierarchyWithMeta,
} from "./breakdown/period-breakdown-hierarchy";
export {
  type BreakdownHierarchyAccumulatorItem,
  type ExpenseBreakdownAccumulatorItem,
  type PeriodGroupNode,
} from "./breakdown/period-breakdown-state";
export { buildSignedBreakdownHierarchyWithMeta } from "./breakdown/period-signed-breakdown-hierarchy";

export function round2(value: MoneyInput): Money {
  return moneyRound2(value);
}

export function shouldIncludeTransactionForPeriod(args: {
  bookingDates: Date[];
  periodStart: Date;
  periodEndExclusive: Date;
}): boolean {
  const { bookingDates, periodStart, periodEndExclusive } = args;

  if (bookingDates.length === 0) {
    return false;
  }

  const hasBookingInPeriod = bookingDates.some(
    (date) => date >= periodStart && date < periodEndExclusive,
  );
  if (!hasBookingInPeriod) {
    return false;
  }

  return bookingDates.every((date) => date < periodEndExclusive);
}

export function buildAvailableYears(args: {
  firstBookingDate: Date | null;
  now: Date;
}): number[] {
  const currentYear = args.now.getUTCFullYear();
  const minYear = args.firstBookingDate
    ? startOfUtcDay(args.firstBookingDate).getUTCFullYear()
    : currentYear;

  const years: number[] = [];
  for (let year = currentYear; year >= minYear; year -= 1) {
    years.push(year);
  }

  return years;
}
