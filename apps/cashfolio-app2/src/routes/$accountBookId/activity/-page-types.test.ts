import { describe, expect, test } from "vitest";
import {
  parseActivityExplicitPeriod,
  parseActivitySearch,
} from "./-page-types";

describe("parseActivitySearch", () => {
  test("keeps normalized explicit period and transaction search params", () => {
    expect(
      parseActivitySearch({
        period: " 2026-03 ",
        transactionId: "transaction-1",
      }),
    ).toEqual({
      period: "2026-03",
      transactionId: "transaction-1",
    });
  });

  test("drops non-explicit period values", () => {
    expect(parseActivitySearch({ period: "mtd" })).toEqual({
      period: undefined,
      transactionId: undefined,
    });
  });
});

describe("parseActivityExplicitPeriod", () => {
  test("parses month and year periods with labels", () => {
    expect(parseActivityExplicitPeriod("2026-03")).toEqual({
      value: "2026-03",
      granularity: "month",
      year: 2026,
      month: 2,
      label: "March 2026",
    });
    expect(parseActivityExplicitPeriod("2026")).toEqual({
      value: "2026",
      granularity: "year",
      year: 2026,
      month: null,
      label: "2026",
    });
  });
});
