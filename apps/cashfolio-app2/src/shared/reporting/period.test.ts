import { describe, expect, test } from "vitest";
import {
  formatMonthPeriodLabel,
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "./period";
import {
  buildPeriodSelectorModel,
  getPeriodStepValue,
} from "./period-selector-model";

describe("Temporal period boundaries", () => {
  test.each([
    ["2024-02", "2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z"],
    ["2026-12", "2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
    ["2026", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
  ])(
    "keeps %s ranges inclusive/exclusive at UTC midnight",
    (value, from, to) => {
      const selection = parseExplicitPeriodSelection(value)!;
      const range = getExplicitPeriodDateRange(selection);
      expect(range.from.toISOString()).toBe(from);
      expect(range.toExclusive.toISOString()).toBe(to);
    },
  );

  test("retains zero-based month interfaces and localized labels", () => {
    expect(parseExplicitPeriodSelection("2026-12")?.month).toBe(11);
    expect(formatMonthPeriodLabel(2026, 11, "en-US")).toBe("December 2026");
    expect(formatMonthPeriodLabel(2026, 11, "de-CH")).toBe("Dezember 2026");
  });

  test("picker bounds retain local noon and navigation crosses year boundaries", () => {
    const model = buildPeriodSelectorModel({
      selectedGranularity: "month",
      selectedYear: 2026,
      selectedMonth: 0,
      minBookingDate: new Date("2025-12-15T00:00:00.000Z"),
      maxDate: new Date("2026-03-29T00:00:00.000Z"),
    });
    expect(model.minMonthPickerDate.getFullYear()).toBe(2025);
    expect(model.minMonthPickerDate.getMonth()).toBe(11);
    expect(model.minMonthPickerDate.getHours()).toBe(12);
    expect(model.maxMonthPickerDate.getMonth()).toBe(2);
    expect(getPeriodStepValue({ ...model, selectedYear: 2026, step: -1 })).toBe(
      "2025-12",
    );
  });
});
