import { expect, test } from "vitest";
import {
  buildPeriodSelectorModel,
  getPeriodStepValue,
} from "@/shared/period-selector-model";
import { clampLedgerExplicitPeriodToBounds } from "./-explicit-period-bounds";
import { parseLedgerExplicitPeriod } from "./-page-types";

test.each([
  ["2026-01", "2026-01"],
  ["2026", "2026"],
  ["2025-12", "2026-01"],
  ["2025", "2026"],
  ["2027-01", "2026-10"],
  ["2027", "2026"],
])("clamps explicit period %s to book bounds (%s)", (period, expected) => {
  expect(
    clampLedgerExplicitPeriodToBounds({
      selectedPeriod: parseLedgerExplicitPeriod(period)!,
      minBookingDate: new Date("2026-01-08T00:00:00Z"),
      maxDate: new Date("2026-10-10T00:00:00Z"),
    }),
  ).toBe(expected);
});

test.each(["month", "year"] as const)(
  "keeps the picker minimum when an empty %s period is selected",
  (mode) => {
    const model = buildPeriodSelectorModel({
      selectedGranularity: mode,
      selectedYear: 2025,
      selectedMonth: mode === "month" ? 11 : null,
      minBookingDate: new Date("2026-03-10T00:00:00Z"),
      maxDate: new Date("2026-10-10T00:00:00Z"),
    });
    expect(model.canGoToPreviousPeriod).toBe(false);
    expect(model.canGoToNextPeriod).toBe(true);
    expect(model.minMonthPickerDate.getFullYear()).toBe(2026);
    expect(model.minMonthPickerDate.getMonth()).toBe(2);
    expect(getPeriodStepValue({ ...model, step: 1, selectedYear: 2025 })).toBe(
      mode === "month" ? "2026-03" : "2026",
    );
  },
);

test.each(["2026", "2026-01"])(
  "uses current period bounds when the book has no minimum (%s)",
  (period) => {
    expect(
      clampLedgerExplicitPeriodToBounds({
        selectedPeriod: parseLedgerExplicitPeriod(period)!,
        minBookingDate: null,
        maxDate: new Date("2026-10-10T00:00:00Z"),
      }),
    ).toBe(period === "2026" ? "2026" : "2026-10");
  },
);
