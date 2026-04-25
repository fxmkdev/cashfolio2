import { describe, expect, test } from "vitest";
import { AccountType } from "@/.prisma-client/enums";
import { resolvePeriodFilterMinBookingDate } from "./-period-filter-min-booking-date";

describe("resolvePeriodFilterMinBookingDate", () => {
  const accountBookMinDate = new Date("2026-01-01T00:00:00.000Z");

  test("uses first account booking for asset/liability accounts", () => {
    const result = resolvePeriodFilterMinBookingDate({
      accountType: AccountType.ASSET,
      accountBookMinBookingDate: accountBookMinDate,
      firstAccountBookingDate: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(result?.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  test("never allows dates before account-book start for asset/liability accounts", () => {
    const result = resolvePeriodFilterMinBookingDate({
      accountType: AccountType.LIABILITY,
      accountBookMinBookingDate: accountBookMinDate,
      firstAccountBookingDate: new Date("2025-12-31T00:00:00.000Z"),
    });

    expect(result?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  test("returns null for asset/liability accounts without bookings", () => {
    const result = resolvePeriodFilterMinBookingDate({
      accountType: AccountType.ASSET,
      accountBookMinBookingDate: accountBookMinDate,
      firstAccountBookingDate: null,
    });

    expect(result).toBeNull();
  });

  test("keeps equity behavior based on account-book start date", () => {
    const result = resolvePeriodFilterMinBookingDate({
      accountType: AccountType.EQUITY,
      accountBookMinBookingDate: accountBookMinDate,
      firstAccountBookingDate: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(result?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
