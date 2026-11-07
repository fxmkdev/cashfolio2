import { describe, expect, test } from "vitest";
import {
  getBookingPeriodValue,
  getLatestBookingDate,
} from "./transaction-period";

describe("transaction period helpers", () => {
  test("uses month periods by default", () => {
    expect(
      getBookingPeriodValue({
        date: new Date("2026-03-05T00:00:00.000Z"),
      }),
    ).toBe("2026-03");
  });

  test("preserves year granularity when the current period is a year", () => {
    expect(
      getBookingPeriodValue({
        date: new Date("2026-03-05T00:00:00.000Z"),
        currentPeriodValue: "2025",
      }),
    ).toBe("2026");
  });

  test("finds the latest valid booking date", () => {
    expect(
      getLatestBookingDate([
        { date: "2026-01-01T00:00:00.000Z" },
        { date: "invalid" },
        { date: "2026-04-01T00:00:00.000Z" },
      ])?.toISOString(),
    ).toBe("2026-04-01T00:00:00.000Z");
  });
});
