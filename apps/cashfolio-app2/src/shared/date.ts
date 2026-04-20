export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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
