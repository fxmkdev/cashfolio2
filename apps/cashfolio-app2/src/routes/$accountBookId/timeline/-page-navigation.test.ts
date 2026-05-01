import { describe, expect, test } from "vitest";
import { buildTimelineModeNavigation } from "./-page-navigation";

describe("timeline page navigation", () => {
  test("uses history replace and preserves existing search params", () => {
    const navigation = buildTimelineModeNavigation("year");

    expect(navigation.replace).toBe(true);
    expect(
      navigation.search({
        mode: "month",
        q: "keep-me",
      }),
    ).toEqual({
      mode: "year",
      q: "keep-me",
    });
  });

  test("clears mode from URL when switching to default month mode", () => {
    const navigation = buildTimelineModeNavigation("month");

    expect(
      navigation.search({
        mode: "year",
        q: "keep-me",
      }),
    ).toEqual({
      mode: undefined,
      q: "keep-me",
    });
  });
});
