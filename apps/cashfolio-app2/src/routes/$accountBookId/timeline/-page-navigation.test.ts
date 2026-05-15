import { describe, expect, test } from "vitest";
import { buildTimelineSearchNavigation } from "./-page-navigation";

describe("timeline page navigation", () => {
  test("uses history replace and preserves existing search params", () => {
    const navigation = buildTimelineSearchNavigation({
      mode: "year",
      metric: "savings",
      incomeScope: "group:income-1",
      expenseScope: "account:expense-1",
      gainLossScope: "unit-type:fx",
      assetScope: "group:asset-1",
      liabilityScope: "account:liability-1",
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
      incomeScope: "group:income-1",
      expenseScope: "account:expense-1",
      gainLossScope: "unit-type:fx",
      assetScope: "group:asset-1",
      liabilityScope: "account:liability-1",
      q: "keep-me",
    });
  });

  test("clears default mode and metric values from the URL", () => {
    const navigation = buildTimelineSearchNavigation({
      mode: "month",
      metric: "totalReturn",
      incomeScope: "total",
      expenseScope: "total",
      gainLossScope: "total",
      assetScope: "total",
      liabilityScope: "total",
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
      incomeScope: undefined,
      expenseScope: undefined,
      gainLossScope: undefined,
      assetScope: undefined,
      liabilityScope: undefined,
      q: "keep-me",
    });
  });
});
