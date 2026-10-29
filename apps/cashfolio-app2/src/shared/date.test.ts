import { Temporal } from "./temporal";
import {
  fromUtcPlainDate,
  toUtcPlainDate,
  toTemporalInstant,
} from "./temporal-adapters";
import {
  addUtcDays,
  earliestDate,
  isBeforeDate,
  isSameLocalDay,
  startOfLocalDay,
  formatLocalDate,
} from "./date";
import { describe, expect, test } from "vitest";
import {
  createDateInputValueFromUtcDay,
  formatUtcDateForLocale,
  formatDateInputValueAsUtcDayIsoString,
  getDateInputValueFormat,
  formatUtcDate,
  getUtcDayRange,
  getOpeningBalancesBookingDate,
  MILLISECONDS_PER_DAY,
  normalizeDateInputValue,
  normalizeDateInputValueToUtcDay,
  parseUtcDayDate,
  isSameUtcDay,
  startOfUtcDay,
  startOfUtcMonth,
} from "./date";

describe("shared/date", () => {
  test("startOfUtcDay normalizes to midnight UTC", () => {
    const result = startOfUtcDay(new Date("2026-04-20T17:42:11.123Z"));

    expect(result.toISOString()).toBe("2026-04-20T00:00:00.000Z");
  });

  test("startOfUtcMonth normalizes to the first day of the UTC month", () => {
    const result = startOfUtcMonth(new Date("2026-05-17T11:42:11.123Z"));

    expect(result.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  test("getOpeningBalancesBookingDate returns account-book start day minus one day", () => {
    const result = getOpeningBalancesBookingDate(
      new Date("2026-04-20T15:30:00.000Z"),
    );

    expect(result.toISOString()).toBe("2026-04-19T00:00:00.000Z");
  });

  test("getUtcDayRange returns [start, next day) in UTC", () => {
    const range = getUtcDayRange(new Date("2026-04-20T17:42:11.123Z"));

    expect(range.start.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-04-21T00:00:00.000Z");
    expect(range.endExclusive.getTime() - range.start.getTime()).toBe(
      MILLISECONDS_PER_DAY,
    );
  });

  test("isSameUtcDay compares by UTC day boundaries", () => {
    expect(
      isSameUtcDay(
        new Date("2026-04-20T00:00:00.000Z"),
        new Date("2026-04-20T23:59:59.999Z"),
      ),
    ).toBe(true);

    expect(
      isSameUtcDay(
        new Date("2026-04-20T23:59:59.999Z"),
        new Date("2026-04-21T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  test("formatUtcDate returns YYYY-MM-DD", () => {
    expect(formatUtcDate(new Date("2026-04-20T17:42:11.123Z"))).toBe(
      "2026-04-20",
    );
  });

  test("formats UTC dates for the selected locale", () => {
    const date = new Date("2026-04-20T17:42:11.123Z");

    expect(formatUtcDateForLocale(date, "en-US")).toBe("4/20/2026");
    expect(formatUtcDateForLocale(date, "de-CH")).toBe("20.4.2026");
  });

  test("resolves locale-aware date input formats", () => {
    expect(getDateInputValueFormat("en-US")).toBe("MM/DD/YYYY");
    expect(getDateInputValueFormat("de-CH")).toBe("DD.MM.YYYY");
    expect(getDateInputValueFormat("fr-FR")).toBe("DD/MM/YYYY");
  });

  test("normalizeDateInputValue accepts Date instances and ISO strings", () => {
    const fromDate = normalizeDateInputValue(
      new Date("2026-04-20T00:00:00.000Z"),
    );
    const fromIsoString = normalizeDateInputValue("2026-04-20T00:00:00.000Z");
    const fromYyyyMmDd = normalizeDateInputValue("2026-04-20");

    expect(fromDate?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(fromIsoString?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(fromYyyyMmDd?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
  });

  test("normalizes DateInput Date instances by local calendar day", () => {
    const dateInputValue = new Date(2026, 4, 18, 0, 0, 0, 0);

    expect(normalizeDateInputValueToUtcDay(dateInputValue)?.toISOString()).toBe(
      "2026-05-18T00:00:00.000Z",
    );
    expect(formatDateInputValueAsUtcDayIsoString(dateInputValue)).toBe(
      "2026-05-18T00:00:00.000Z",
    );
  });

  test("preserves Date instances that already represent UTC days", () => {
    const utcDayValue = new Date("2026-05-18T00:00:00.000Z");

    expect(normalizeDateInputValueToUtcDay(utcDayValue)?.toISOString()).toBe(
      "2026-05-18T00:00:00.000Z",
    );
    expect(formatDateInputValueAsUtcDayIsoString(utcDayValue)).toBe(
      "2026-05-18T00:00:00.000Z",
    );
  });

  test("normalizes strings by UTC day", () => {
    expect(
      normalizeDateInputValueToUtcDay(
        "2026-05-18T22:30:00.000Z",
      )?.toISOString(),
    ).toBe("2026-05-18T00:00:00.000Z");
  });

  test("parses only canonical UTC day values", () => {
    expect(parseUtcDayDate("2026-05-18")?.toISOString()).toBe(
      "2026-05-18T00:00:00.000Z",
    );
    expect(parseUtcDayDate("2026-05-18T00:00:00.000Z")?.toISOString()).toBe(
      "2026-05-18T00:00:00.000Z",
    );
    expect(parseUtcDayDate("2026-05-18T22:00:00.000Z")).toBeNull();
    expect(parseUtcDayDate("2026-02-31T00:00:00.000Z")).toBeNull();
  });

  test("creates DateInput values from UTC days by local calendar day", () => {
    const result = createDateInputValueFromUtcDay("2026-05-18T00:00:00.000Z");

    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(4);
    expect(result?.getDate()).toBe(18);
  });

  test("normalizeDateInputValue parses display-format strings and rejects invalid values", () => {
    const parsed = normalizeDateInputValue("20.04.2026");
    const invalid = normalizeDateInputValue("not-a-date");
    const empty = normalizeDateInputValue("  ");
    const usDate = normalizeDateInputValue("04/20/2026", "en-US");
    const europeanDate = normalizeDateInputValue("20/04/2026", "fr-FR");
    const impossibleCalendarDate = normalizeDateInputValue("31.02.2026");

    expect(parsed?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(invalid).toBeNull();
    expect(empty).toBeNull();
    expect(usDate?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(europeanDate?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(impossibleCalendarDate).toBeNull();
  });

  test("normalizeDateInputValue prefers locale parsing before Swiss compatibility fallback", () => {
    const ambiguousUsDate = normalizeDateInputValue("04.05.2026", "en-US");
    const swissFallbackDate = normalizeDateInputValue("31.12.2026", "en-US");

    expect(ambiguousUsDate?.toISOString()).toBe("2026-04-05T00:00:00.000Z");
    expect(swissFallbackDate?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("Temporal calendar compatibility", () => {
  test("strictly validates leap dates and retains the accepted year range", () => {
    expect(parseUtcDayDate("2024-02-29")?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    for (const value of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "0099-01-01",
      "0000-01-01",
    ]) {
      expect(parseUtcDayDate(value)).toBeNull();
    }
    expect(parseUtcDayDate("0100-01-01")?.toISOString()).toBe(
      "0100-01-01T00:00:00.000Z",
    );
  });

  test.each([
    ["2026-03-29T00:30:00+01:00", "2026-03-28T23:30:00.000Z"],
    ["2026-10-25T02:30:00+02:00", "2026-10-25T00:30:00.000Z"],
    ["2026-10-25T02:30:00+01:00", "2026-10-25T01:30:00.000Z"],
    ["2026-04-20T24:00Z", "2026-04-21T00:00:00.000Z"],
    ["2026-04-20T12:34:56.12-07:00", "2026-04-20T19:34:56.120Z"],
    ["2026-04-20T00:00+99:00", "2026-04-15T21:00:00.000Z"],
  ])("preserves ISO instant parsing for %s", (value, expected) => {
    expect(normalizeDateInputValue(value)?.toISOString()).toBe(expected);
  });

  test.each([
    "2026-02-30T12:00Z",
    "2026-04-20T24:01Z",
    "2026-04-20T24:00:00.001Z",
    "2026-04-20T12:00:60Z",
    "2026-04-20T12:60Z",
    "2026-04-20T00:00+01:60",
  ])("rejects invalid ISO date/time %s", (value) => {
    expect(normalizeDateInputValue(value)).toBeNull();
  });

  test("UTC day arithmetic crosses DST and month/year boundaries without losing time", () => {
    for (const [start, expected] of [
      ["2026-03-28T23:30:01.123Z", "2026-03-29T23:30:01.123Z"],
      ["2026-10-24T23:30:01.123Z", "2026-10-25T23:30:01.123Z"],
      ["2024-02-28T12:00:00.000Z", "2024-02-29T12:00:00.000Z"],
      ["2026-12-31T12:00:00.000Z", "2027-01-01T12:00:00.000Z"],
    ]) {
      expect(addUtcDays(new Date(start), 1).toISOString()).toBe(expected);
    }
    expect(addUtcDays(new Date("2026-01-01T12:00Z"), 0.5).toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  test("local picker dates round trip independently of the process/browser timezone", () => {
    for (const day of [
      "2026-03-08",
      "2026-03-29",
      "2026-10-25",
      "2026-11-01",
    ]) {
      const date = createDateInputValueFromUtcDay(`${day}T00:00:00.000Z`)!;
      expect(formatDateInputValueAsUtcDayIsoString(date)).toBe(
        `${day}T00:00:00.000Z`,
      );
      expect(isSameLocalDay(date, startOfLocalDay(date))).toBe(true);
      expect(formatLocalDate(date).split(".").reverse().join("-")).toBe(day);
    }
  });

  test("converts calendar dates and instants at Date boundaries", () => {
    const date = new Date("2026-10-29T12:34:56.789Z");
    expect(toTemporalInstant(date).epochMilliseconds).toBe(date.getTime());
    expect(toUtcPlainDate(date).toString()).toBe("2026-10-29");
    expect(
      fromUtcPlainDate(Temporal.PlainDate.from("2026-10-29")).toISOString(),
    ).toBe("2026-10-29T00:00:00.000Z");
    expect(earliestDate([date, new Date("2026-01-01")])).toEqual(
      new Date("2026-01-01"),
    );
    expect(Number.isNaN(earliestDate([]).getTime())).toBe(true);
    expect(Number.isNaN(earliestDate([new Date(NaN)]).getTime())).toBe(true);
    expect(isBeforeDate(date, new Date(NaN))).toBe(false);
    expect(isSameLocalDay(new Date(NaN), date)).toBe(false);
    expect(isSameUtcDay(new Date(NaN), date)).toBe(false);
    expect(Number.isNaN(startOfUtcDay(new Date(NaN)).getTime())).toBe(true);
    expect(Number.isNaN(startOfUtcMonth(new Date(NaN)).getTime())).toBe(true);
    expect(Number.isNaN(addUtcDays(date, NaN).getTime())).toBe(true);
  });
});
