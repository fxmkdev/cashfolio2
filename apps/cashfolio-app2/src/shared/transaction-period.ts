import { toUtcPlainDate } from "./temporal-adapters";
import { formatMonthPeriodValue, parseExplicitPeriodSelection } from "./period";

export function getBookingPeriodValue(args: {
  date: Date;
  currentPeriodValue?: string;
}): string {
  const currentPeriod = args.currentPeriodValue
    ? parseExplicitPeriodSelection(args.currentPeriodValue)
    : null;
  if (currentPeriod?.granularity === "year") {
    return String(toUtcPlainDate(args.date).year).padStart(4, "0");
  }

  return formatMonthPeriodValue(
    toUtcPlainDate(args.date).year,
    toUtcPlainDate(args.date).month - 1,
  );
}

export function getLatestBookingDate(
  bookings: { date: string | Date }[],
): Date | null {
  let latestDate: Date | null = null;

  for (const booking of bookings) {
    const date =
      booking.date instanceof Date ? booking.date : new Date(booking.date);
    if (isNaN(date.getTime())) {
      continue;
    }
    if (!latestDate || date > latestDate) {
      latestDate = date;
    }
  }

  return latestDate;
}
