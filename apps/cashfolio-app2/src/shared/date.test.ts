import { describe, expect, test } from "vitest";
import {
  formatUtcDateForLocale,
  getDateInputValueFormat,
  formatUtcDate,
  getUtcDayRange,
  getOpeningBalancesBookingDate,
  MILLISECONDS_PER_DAY,
  normalizeDateInputValue,
  isSameUtcDay,
  startOfUtcDay,
} from "./date";

describe("shared/date", () => {
  test("startOfUtcDay normalizes to midnight UTC", () => {
    const result = startOfUtcDay(new Date("2026-04-20T17:42:11.123Z"));

    expect(result.toISOString()).toBe("2026-04-20T00:00:00.000Z");
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
