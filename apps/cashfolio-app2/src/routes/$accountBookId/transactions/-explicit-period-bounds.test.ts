import { describe, expect, test } from "vitest";
import { clampTransactionsExplicitPeriodToBounds } from "./-explicit-period-bounds";
import { parseTransactionsExplicitPeriod } from "./-page-types";

describe("clampTransactionsExplicitPeriodToBounds", () => {
  test("clamps month selections to account-book period bounds", () => {
    const selectedPeriod = parseTransactionsExplicitPeriod("2020-01");
    expect(selectedPeriod).not.toBeNull();
    if (!selectedPeriod) return;

    expect(
      clampTransactionsExplicitPeriodToBounds({
        selectedPeriod,
        minBookingDate: new Date("2026-05-13T00:00:00.000Z"),
        maxDate: new Date("2026-12-31T00:00:00.000Z"),
      }),
    ).toBe("2026-05");
  });

  test.each([
    ["2020-01", "2026-05"],
    ["2025-12", "2026-10"],
    ["2027-01", "2026-05"],
    ["2027", "2026"],
    ["2025", "2026"],
    ["2026-06", "2026-06"],
  ])(
    "preserves Transactions' year-then-month clamping for %s",
    (period, expected) => {
      expect(
        clampTransactionsExplicitPeriodToBounds({
          selectedPeriod: parseTransactionsExplicitPeriod(period)!,
          minBookingDate: new Date("2026-05-13T00:00:00Z"),
          maxDate: new Date("2026-10-10T00:00:00Z"),
        }),
      ).toBe(expected);
    },
  );

  test.each(["2026", "2026-01"])(
    "uses current bounds without a minimum (%s)",
    (period) => {
      expect(
        clampTransactionsExplicitPeriodToBounds({
          selectedPeriod: parseTransactionsExplicitPeriod(period)!,
          minBookingDate: null,
          maxDate: new Date("2026-10-10T00:00:00Z"),
        }),
      ).toBe(period === "2026" ? "2026" : "2026-10");
    },
  );
});
