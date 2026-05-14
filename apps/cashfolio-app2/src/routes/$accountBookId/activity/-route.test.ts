import { describe, expect, test } from "vitest";
import { clampActivityExplicitPeriodToBounds } from "./route";
import { parseActivityExplicitPeriod } from "./-page-types";

describe("clampActivityExplicitPeriodToBounds", () => {
  test("clamps month selections to account-book period bounds", () => {
    const selectedPeriod = parseActivityExplicitPeriod("2020-01");
    expect(selectedPeriod).not.toBeNull();
    if (!selectedPeriod) return;

    expect(
      clampActivityExplicitPeriodToBounds({
        selectedPeriod,
        minBookingDate: new Date("2026-05-13T00:00:00.000Z"),
        maxDate: new Date("2026-12-31T00:00:00.000Z"),
      }),
    ).toBe("2026-05");
  });
});
