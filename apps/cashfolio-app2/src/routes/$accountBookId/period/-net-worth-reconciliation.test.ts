import { describe, expect, it } from "vitest";
import {
  buildNetWorthReconciliationModel,
  getPreviousPeriodValue,
} from "./-net-worth-reconciliation";

describe("buildNetWorthReconciliationModel", () => {
  it("does not warn when values match at cent precision", () => {
    const result = buildNetWorthReconciliationModel({
      baselineNetWorth: 100,
      baselineSource: "previous-period",
      currentNetWorth: 130.004,
      totalReturn: 30,
    });

    expect(result).toMatchObject({
      hasMismatch: false,
      expectedNetWorth: 130,
      currentNetWorth: 130,
      difference: 0,
    });
  });

  it("warns when values differ after cent rounding", () => {
    const result = buildNetWorthReconciliationModel({
      baselineNetWorth: 100,
      baselineSource: "previous-period",
      currentNetWorth: 130.01,
      totalReturn: 30,
    });

    expect(result).toMatchObject({
      hasMismatch: true,
      expectedNetWorth: 130,
      currentNetWorth: 130.01,
      difference: 0.01,
    });
  });
});

describe("getPreviousPeriodValue", () => {
  it("returns previous month when available", () => {
    expect(
      getPreviousPeriodValue({
        selectedGranularity: "month",
        selectedYear: 2026,
        selectedMonth: 2,
        minBookingDate: new Date("2026-01-08T00:00:00.000Z"),
      }),
    ).toBe("2026-02");
  });

  it("returns null for first available month", () => {
    expect(
      getPreviousPeriodValue({
        selectedGranularity: "month",
        selectedYear: 2026,
        selectedMonth: 0,
        minBookingDate: new Date("2026-01-08T00:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("returns previous year when available", () => {
    expect(
      getPreviousPeriodValue({
        selectedGranularity: "year",
        selectedYear: 2027,
        selectedMonth: null,
        minBookingDate: new Date("2026-01-08T00:00:00.000Z"),
      }),
    ).toBe("2026");
  });

  it("returns null for first available year", () => {
    expect(
      getPreviousPeriodValue({
        selectedGranularity: "year",
        selectedYear: 2026,
        selectedMonth: null,
        minBookingDate: new Date("2026-01-08T00:00:00.000Z"),
      }),
    ).toBeNull();
  });
});
