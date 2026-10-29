import { addUtcDays, formatUtcDate, startOfUtcDay } from "../../shared/date";

export const toDayString = formatUtcDate;

export function toSeriesTimestamp(date: Date): number {
  return startOfUtcDay(date).getTime();
}

export const toUtcDay = startOfUtcDay;

export function subUtcDay(date: Date): Date {
  return addUtcDays(date, -1);
}

export function subUtcDays(date: Date, days: number): Date {
  return addUtcDays(date, -days);
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
