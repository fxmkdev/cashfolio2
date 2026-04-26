import { describe, expect, test } from "vitest";
import {
  getDefaultTimelinePageSessionState,
  parseStoredTimelinePageSessionState,
} from "./-page-session-state";

describe("getDefaultTimelinePageSessionState", () => {
  test("defaults to month mode", () => {
    expect(getDefaultTimelinePageSessionState()).toEqual({
      periodMode: "month",
    });
  });
});

describe("parseStoredTimelinePageSessionState", () => {
  test("restores valid persisted mode", () => {
    expect(
      parseStoredTimelinePageSessionState({
        periodMode: "year",
      }),
    ).toEqual({
      periodMode: "year",
    });
  });

  test("falls back to month for invalid payloads", () => {
    expect(
      parseStoredTimelinePageSessionState({
        periodMode: "quarter",
      }),
    ).toEqual({
      periodMode: "month",
    });
    expect(parseStoredTimelinePageSessionState(null)).toEqual({
      periodMode: "month",
    });
  });
});
