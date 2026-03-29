const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDayString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toSeriesTimestamp(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function toUtcDay(date: Date): Date {
  return new Date(toSeriesTimestamp(date));
}

export function subUtcDay(date: Date): Date {
  return new Date(date.getTime() - MILLISECONDS_PER_DAY);
}

export function subUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MILLISECONDS_PER_DAY);
}

export function getLatestAssumedAvailableHistoricalUtcDay(args: {
  now: Date;
  historicalDataDayLag: number;
  historicalDataAvailableAtUtcMinute: number;
}): Date {
  const todayUtc = toUtcDay(args.now);
  const todayAvailabilityTimestamp =
    todayUtc.getTime() + args.historicalDataAvailableAtUtcMinute * 60 * 1000;
  const hasReachedAvailabilityTime =
    args.now.getTime() >= todayAvailabilityTimestamp;
  const daysToSubtract = hasReachedAvailabilityTime
    ? args.historicalDataDayLag
    : args.historicalDataDayLag + 1;

  return subUtcDays(todayUtc, daysToSubtract);
}
