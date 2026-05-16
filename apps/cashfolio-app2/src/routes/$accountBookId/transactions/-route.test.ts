import { describe, expect, test } from "vitest";
import { clampTransactionsExplicitPeriodToBounds } from "./route";
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
});
