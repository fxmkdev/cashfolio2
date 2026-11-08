import { describe, expect, test } from "vitest";
import { toNumericMoney } from "./money-boundary";
import {
  DEFAULT_PERIOD_VALUE,
  getPeriodEndExclusive,
  normalizePeriodValue,
  resolvePeriodSelection,
} from "./period.test-support";

describe("normalizePeriodValue", () => {
  test("normalizes valid values", () => {
    expect(toNumericMoney(normalizePeriodValue(" LAST-MONTH "))).toBe(
      "last-month",
    );
    expect(normalizePeriodValue("2026-3")).toBe(DEFAULT_PERIOD_VALUE);
    expect(toNumericMoney(normalizePeriodValue("2026-03"))).toBe("2026-03");
    expect(toNumericMoney(normalizePeriodValue("2026"))).toBe("2026");
  });

  test("falls back to default for unsupported values", () => {
    expect(normalizePeriodValue("0099")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("0100")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("0099-01")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("0100-01")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue("not-valid")).toBe(DEFAULT_PERIOD_VALUE);
    expect(normalizePeriodValue(null)).toBe(DEFAULT_PERIOD_VALUE);
  });
});
describe("resolvePeriodSelection", () => {
  test("uses yesterday cutoff for current month (MTD)", () => {
    const selection = resolvePeriodSelection({
      periodValue: "mtd",
      now: new Date("2026-03-28T15:30:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(toNumericMoney(selection.periodSpecifier)).toBe("mtd");
  });

  test("clamps current period to a non-inverted range on the first day", () => {
    const selection = resolvePeriodSelection({
      periodValue: "mtd",
      now: new Date("2026-03-01T10:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  test("uses yesterday cutoff for current year (YTD)", () => {
    const selection = resolvePeriodSelection({
      periodValue: "ytd",
      now: new Date("2026-03-28T10:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(toNumericMoney(selection.periodSpecifier)).toBe("ytd");
  });

  test("uses natural month end for historical months", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2024-02",
      now: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(toNumericMoney(selection.periodSpecifier)).toBe("month");
  });

  test("clamps explicit month to current month when no bookings exist", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2000-01",
      now: new Date("2026-03-28T00:00:00.000Z"),
      firstBookingDate: null,
    });

    expect(toNumericMoney(selection.year)).toBe(2026);
    expect(toNumericMoney(selection.month)).toBe(2);
    expect(selection.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(toNumericMoney(selection.periodSpecifier)).toBe("month");
  });

  test("uses natural year end for historical years", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2025",
      now: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2025-12-31T00:00:00.000Z");
    expect(toNumericMoney(selection.periodSpecifier)).toBe("year");
  });

  test("clamps explicit year to current year when no bookings exist", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2000",
      now: new Date("2026-03-28T00:00:00.000Z"),
      firstBookingDate: null,
    });

    expect(toNumericMoney(selection.year)).toBe(2026);
    expect(selection.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(toNumericMoney(selection.periodSpecifier)).toBe("year");
  });

  test("starts first year at first booking month", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2026",
      now: new Date("2026-11-15T00:00:00.000Z"),
      firstBookingDate: new Date("2026-05-13T10:30:00.000Z"),
    });

    expect(selection.from.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });
});
describe("getPeriodEndExclusive", () => {
  test("returns the start of the next UTC day", () => {
    const result = getPeriodEndExclusive(new Date("2026-02-28T13:45:00.000Z"));

    expect(result.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
