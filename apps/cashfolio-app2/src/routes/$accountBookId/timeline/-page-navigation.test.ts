import { describe, expect, test } from "vitest";
import { buildTimelineSearchNavigation } from "./-page-navigation";

describe("timeline page navigation", () => {
  test("uses history replace and preserves existing search params", () => {
    const navigation = buildTimelineSearchNavigation({
      mode: "year",
      metric: "savings",
    });

    expect(navigation.replace).toBe(true);
    expect(
      navigation.search({
        mode: "month",
        metric: "income",
        q: "keep-me",
      }),
    ).toEqual({
      mode: "year",
      metric: "savings",
      q: "keep-me",
    });
  });

  test("clears default mode and metric values from the URL", () => {
    const navigation = buildTimelineSearchNavigation({
      mode: "month",
      metric: "totalReturn",
    });

    expect(
      navigation.search({
        mode: "year",
        metric: "savings",
        q: "keep-me",
      }),
    ).toEqual({
      mode: undefined,
      metric: undefined,
      q: "keep-me",
    });
  });
});
