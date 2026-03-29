import { describe, expect, test } from "vitest";
import { getLatestAssumedAvailableHistoricalUtcDay } from "./date-utils";

describe("getLatestAssumedAvailableHistoricalUtcDay", () => {
  test("returns two days back before publication cutoff", () => {
    const result = getLatestAssumedAvailableHistoricalUtcDay({
      now: new Date("2026-03-29T00:04:59.000Z"),
      historicalDataDayLag: 1,
      historicalDataAvailableAtUtcMinute: 5,
    });

    expect(result.toISOString()).toBe("2026-03-27T00:00:00.000Z");
  });

  test("returns previous day at and after publication cutoff", () => {
    const atCutoff = getLatestAssumedAvailableHistoricalUtcDay({
      now: new Date("2026-03-29T00:05:00.000Z"),
      historicalDataDayLag: 1,
      historicalDataAvailableAtUtcMinute: 5,
    });
    const afterCutoff = getLatestAssumedAvailableHistoricalUtcDay({
      now: new Date("2026-03-29T13:45:00.000Z"),
      historicalDataDayLag: 1,
      historicalDataAvailableAtUtcMinute: 5,
    });

    expect(atCutoff.toISOString()).toBe("2026-03-28T00:00:00.000Z");
    expect(afterCutoff.toISOString()).toBe("2026-03-28T00:00:00.000Z");
  });
});
