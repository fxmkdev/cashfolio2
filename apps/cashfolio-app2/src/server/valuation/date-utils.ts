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
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}
