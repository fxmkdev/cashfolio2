import { describe, expect, test } from "vitest";
import {
  DEFAULT_TIMELINE_MODE,
  getTimelineMode,
  isTimelinePeriodMode,
  parseTimelineSearch,
} from "./-page-types";

describe("isTimelinePeriodMode", () => {
  test("accepts month and year", () => {
    expect(isTimelinePeriodMode("month")).toBe(true);
    expect(isTimelinePeriodMode("year")).toBe(true);
  });

  test("rejects unsupported values", () => {
    expect(isTimelinePeriodMode("quarter")).toBe(false);
    expect(isTimelinePeriodMode(undefined)).toBe(false);
  });
});

describe("parseTimelineSearch", () => {
  test("keeps valid mode values", () => {
    expect(parseTimelineSearch({ mode: "month" })).toEqual({ mode: "month" });
    expect(parseTimelineSearch({ mode: "year" })).toEqual({ mode: "year" });
  });

  test("drops invalid mode values", () => {
    expect(parseTimelineSearch({ mode: "weekly" })).toEqual({
      mode: undefined,
    });
    expect(parseTimelineSearch({ mode: "quarter" })).toEqual({
      mode: undefined,
    });
  });
});

describe("getTimelineMode", () => {
  test("returns explicit mode when present", () => {
    expect(getTimelineMode({ mode: "year" })).toBe("year");
  });

  test("falls back to default mode", () => {
    expect(getTimelineMode({})).toBe(DEFAULT_TIMELINE_MODE);
  });
});
