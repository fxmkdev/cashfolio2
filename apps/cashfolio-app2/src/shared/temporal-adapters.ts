import { Temporal } from "./temporal";

/** Date remains the boundary type for Prisma, charts, and existing responses. */
export function toTemporalInstant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

export function toUtcPlainDate(date: Date): Temporal.PlainDate {
  return toTemporalInstant(date).toZonedDateTimeISO("UTC").toPlainDate();
}

export function toLocalPlainDate(date: Date): Temporal.PlainDate {
  return toTemporalInstant(date)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
}

export function fromUtcPlainDate(date: Temporal.PlainDate): Date {
  return new Date(date.toZonedDateTime("UTC").epochMilliseconds);
}

export function fromLocalPlainDate(date: Temporal.PlainDate, hour = 0): Date {
  return new Date(
    date.toZonedDateTime({
      timeZone: Temporal.Now.timeZoneId(),
      plainTime: Temporal.PlainTime.from({ hour }),
    }).epochMilliseconds,
  );
}
