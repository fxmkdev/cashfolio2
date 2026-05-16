import { describe, expect, test } from "vitest";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "./period-selection";

describe("resolvePeriodSelection (module extraction)", () => {
  test("clamps explicit future month to current month", () => {
    const selection = resolvePeriodSelection({
      periodValue: "2030-12",
      now: new Date("2026-04-15T12:00:00.000Z"),
      firstBookingDate: new Date("2024-01-01T00:00:00.000Z"),
    });

    expect(selection.periodValue).toBe("2026-04");
    expect(selection.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(selection.to.toISOString()).toBe("2026-04-14T00:00:00.000Z");
  });

  test("formats month labels with the selected locale", () => {
    expect(
      resolvePeriodSelection({
        periodValue: "2026-05",
        now: new Date("2026-06-15T12:00:00.000Z"),
        locale: "en-US",
      }).label,
    ).toBe("May 2026");
    expect(
      resolvePeriodSelection({
        periodValue: "2026-05",
        now: new Date("2026-06-15T12:00:00.000Z"),
        locale: "de-CH",
      }).label,
    ).toBe("Mai 2026");
    expect(
      resolvePeriodSelection({
        periodValue: "2026-05",
        now: new Date("2026-06-15T12:00:00.000Z"),
        locale: "fr-FR",
      }).label,
    ).toBe("mai 2026");
  });
});

describe("getPeriodEndExclusive (module extraction)", () => {
  test("returns the next UTC day start", () => {
    const result = getPeriodEndExclusive(new Date("2026-02-28T13:45:00.000Z"));

    expect(result.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
