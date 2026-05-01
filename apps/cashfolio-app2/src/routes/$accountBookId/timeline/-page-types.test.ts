import { describe, expect, test } from "vitest";
import {
  DEFAULT_TIMELINE_MODE,
  getTimelineMode,
  parseTimelineSearch,
} from "./-page-types";

describe("timeline page types", () => {
  test("keeps valid mode values", () => {
    expect(parseTimelineSearch({ mode: "month" })).toEqual({ mode: "month" });
    expect(parseTimelineSearch({ mode: "year" })).toEqual({ mode: "year" });
  });

  test("drops invalid mode values", () => {
    expect(parseTimelineSearch({ mode: "weekly" })).toEqual({
      mode: undefined,
    });
  });

  test("falls back to default mode", () => {
    expect(getTimelineMode({})).toBe(DEFAULT_TIMELINE_MODE);
  });
});
