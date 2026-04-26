import { describe, expect, test } from "vitest";
import { buildTimelinePeriodValues } from "./period-timeline";

describe("buildTimelinePeriodValues", () => {
  test("builds monthly values from account-book start month to current month", () => {
    expect(
      buildTimelinePeriodValues({
        granularity: "month",
        minDate: new Date("2024-11-19T10:15:00.000Z"),
        maxDate: new Date("2025-03-02T21:30:00.000Z"),
      }),
    ).toEqual(["2024-11", "2024-12", "2025-01", "2025-02", "2025-03"]);
  });

  test("builds yearly values from account-book start year to current year", () => {
    expect(
      buildTimelinePeriodValues({
        granularity: "year",
        minDate: new Date("2022-07-01T00:00:00.000Z"),
        maxDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  test("returns empty values for inverted ranges", () => {
    expect(
      buildTimelinePeriodValues({
        granularity: "month",
        minDate: new Date("2026-05-01T00:00:00.000Z"),
        maxDate: new Date("2026-04-01T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});
