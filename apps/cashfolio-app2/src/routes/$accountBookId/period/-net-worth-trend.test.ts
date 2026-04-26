import { describe, expect, test } from "vitest";
import {
  buildNetWorthTrendWindow,
  buildPeriodNetWorthTrendPoints,
} from "./-net-worth-trend";

describe("buildNetWorthTrendWindow", () => {
  test("returns 6 month points in chronological order", () => {
    const result = buildNetWorthTrendWindow({
      selectedGranularity: "month",
      selectedYear: 2026,
      selectedMonth: 2,
      minBookingDate: new Date("2020-01-01T00:00:00.000Z"),
    });

    expect(result).toHaveLength(6);
    expect(result.map((point) => point.periodValue)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(result.at(-1)?.isSelected).toBe(true);
  });

  test("returns 5 year points in chronological order", () => {
    const result = buildNetWorthTrendWindow({
      selectedGranularity: "year",
      selectedYear: 2026,
      selectedMonth: null,
      minBookingDate: new Date("2010-01-01T00:00:00.000Z"),
    });

    expect(result).toHaveLength(5);
    expect(result.map((point) => point.periodValue)).toEqual([
      "2022",
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
    expect(result.at(-1)?.isSelected).toBe(true);
  });

  test("marks pre-history periods out of range and zero-fills them in final points", () => {
    const window = buildNetWorthTrendWindow({
      selectedGranularity: "month",
      selectedYear: 2026,
      selectedMonth: 2,
      minBookingDate: new Date("2026-01-05T00:00:00.000Z"),
    });

    expect(window.map((point) => point.isInRange)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);

    const points = buildPeriodNetWorthTrendPoints({
      window,
      selectedNetWorth: 400,
      netWorthByPeriodValue: new Map([
        ["2026-01", 120],
        ["2026-02", 300],
      ]),
    });

    expect(points.map((point) => point.netWorth)).toEqual([
      0, 0, 0, 120, 300, 400,
    ]);
  });

  test("handles cross-year month rollover for lookback", () => {
    const result = buildNetWorthTrendWindow({
      selectedGranularity: "month",
      selectedYear: 2026,
      selectedMonth: 0,
      minBookingDate: new Date("2020-01-01T00:00:00.000Z"),
    });

    expect(result.map((point) => point.periodValue)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });
});
