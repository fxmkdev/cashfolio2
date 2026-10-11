import { Unit } from "../../.prisma-client/enums";
import { type MoneyInput, type Money, moneyRound2 } from "../../shared/money";
import { startOfUtcDay } from "../../shared/date";
export {
  type PeriodGroupNode,
  type ExpenseBreakdownAccumulatorItem,
  type BreakdownHierarchyAccumulatorItem,
} from "./breakdown/period-breakdown-state";
export {
  type HoldingEvent,
  type HoldingGainLossSeriesEvent,
  computeHoldingGainLossForEventSeries,
  sortHoldingEventsAscending,
  getHoldingEventDateMap,
  filterConvertibleHoldingAccounts,
} from "./holdings/period-holding-events";
export {
  createBreakdownBucket,
  buildBreakdownItems,
} from "./breakdown/period-breakdown-buckets";
export { buildPeriodEndAllocationBreakdown } from "./breakdown/period-allocation-breakdown";
export {
  buildBreakdownHierarchyWithMeta,
  buildBreakdownHierarchy,
} from "./breakdown/period-breakdown-hierarchy";
export { buildSignedBreakdownHierarchyWithMeta } from "./breakdown/period-signed-breakdown-hierarchy";

type MultiUnitBooking = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export function round2(value: MoneyInput): Money {
  return moneyRound2(value);
}

function getBookingUnitIdentifier(booking: MultiUnitBooking): string | null {
  if (booking.unit === Unit.CURRENCY) {
    return booking.currency
      ? `currency:${booking.currency.toUpperCase()}`
      : null;
  }
  if (booking.unit === Unit.CRYPTOCURRENCY) {
    return booking.cryptocurrency
      ? `crypto:${booking.cryptocurrency.toUpperCase()}`
      : null;
  }
  if (!booking.symbol || !booking.tradeCurrency) {
    return null;
  }
  return `security:${booking.symbol.toUpperCase()}:${booking.tradeCurrency.toUpperCase()}`;
}

export function isMultiUnitTransaction(bookings: MultiUnitBooking[]): boolean {
  const unitIdentifiers = new Set<string>();

  for (const booking of bookings) {
    const unitIdentifier = getBookingUnitIdentifier(booking);
    if (!unitIdentifier) {
      return false;
    }
    unitIdentifiers.add(unitIdentifier);
  }

  return unitIdentifiers.size > 1;
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
