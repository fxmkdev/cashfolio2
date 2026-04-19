import { describe, expect, test } from "vitest";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
} from "./-selector-model";

describe("buildPeriodSelectorModel", () => {
  test("derives month navigation limits from booking and max dates", () => {
    const model = buildPeriodSelectorModel({
      selectedGranularity: "month",
      selectedYear: 2026,
      selectedMonth: 1,
      minBookingDate: new Date("2021-03-01T00:00:00.000Z"),
      maxDate: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(model.canGoToPreviousPeriod).toBe(true);
    expect(model.canGoToNextPeriod).toBe(true);
    expect(model.minYear).toBe(2021);
    expect(model.maxYear).toBe(2026);
    expect(model.selectedYearMonthBounds).toEqual({
      minMonth: 0,
      maxMonth: 2,
    });
  });

  test("uses selected year max month when rendering in year mode", () => {
    const model = buildPeriodSelectorModel({
      selectedGranularity: "year",
      selectedYear: 2021,
      selectedMonth: null,
      minBookingDate: new Date("2021-03-01T00:00:00.000Z"),
      maxDate: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(model.selectedMonth).toBe(11);
    expect(model.selectedYearMonthBounds).toEqual({
      minMonth: 2,
      maxMonth: 11,
    });
  });
});

describe("getPeriodModeChangeValue", () => {
  test("returns a year value when switching month to year", () => {
    expect(
      getPeriodModeChangeValue({
        nextMode: "year",
        periodMode: "month",
        selectedYear: 2026,
        selectedYearMaxMonth: 2,
      }),
    ).toBe("2026");
  });

  test("returns a month value when switching year to month", () => {
    expect(
      getPeriodModeChangeValue({
        nextMode: "month",
        periodMode: "year",
        selectedYear: 2024,
        selectedYearMaxMonth: 10,
      }),
    ).toBe(formatMonthPeriodValue(2024, 10));
  });

  test("returns null for invalid or unchanged mode", () => {
    expect(
      getPeriodModeChangeValue({
        nextMode: "week",
        periodMode: "month",
        selectedYear: 2026,
        selectedYearMaxMonth: 2,
      }),
    ).toBeNull();
    expect(
      getPeriodModeChangeValue({
        nextMode: "month",
        periodMode: "month",
        selectedYear: 2026,
        selectedYearMaxMonth: 2,
      }),
    ).toBeNull();
  });
});

describe("getPeriodStepValue", () => {
  test("steps month backward within bounds", () => {
    expect(
      getPeriodStepValue({
        periodMode: "month",
        step: -1,
        selectedMonthIndex: 2026 * 12 + 1,
        minMonthIndex: 2021 * 12 + 2,
        maxMonthIndex: 2026 * 12 + 2,
        selectedYear: 2026,
        minYear: 2021,
        maxYear: 2026,
      }),
    ).toBe(formatMonthPeriodValue(2026, 0));
  });

  test("clamps month stepping at bounds", () => {
    expect(
      getPeriodStepValue({
        periodMode: "month",
        step: 1,
        selectedMonthIndex: 2026 * 12 + 2,
        minMonthIndex: 2021 * 12 + 2,
        maxMonthIndex: 2026 * 12 + 2,
        selectedYear: 2026,
        minYear: 2021,
        maxYear: 2026,
      }),
    ).toBeNull();
  });

  test("steps year within bounds", () => {
    expect(
      getPeriodStepValue({
        periodMode: "year",
        step: -1,
        selectedMonthIndex: 0,
        minMonthIndex: 0,
        maxMonthIndex: 0,
        selectedYear: 2024,
        minYear: 2021,
        maxYear: 2026,
      }),
    ).toBe("2023");
  });
});

describe("picker value parsing", () => {
  test("parses month picker value to explicit month period", () => {
    expect(getMonthPickerValue("2026-03-01")).toBe("2026-03");
  });

  test("rejects invalid month picker values", () => {
    expect(getMonthPickerValue("2026-13-01")).toBeNull();
    expect(getMonthPickerValue("not-a-date")).toBeNull();
  });

  test("parses and validates year picker values", () => {
    expect(getYearPickerValue("2026-01-01")).toBe("2026");
    expect(getYearPickerValue("bad")).toBeNull();
  });
});
