import { describe, expect, test } from "vitest";
import {
  getDefaultTransactionsPeriodValue,
  parseTransactionsExplicitPeriod,
  parseTransactionsSearch,
} from "./-page-types";

describe("parseTransactionsSearch", () => {
  test("keeps normalized explicit period and transaction search params", () => {
    expect(
      parseTransactionsSearch({
        period: " 2026-03 ",
        transactionId: "transaction-1",
      }),
    ).toEqual({
      period: "2026-03",
      transactionId: "transaction-1",
    });
  });

  test("drops non-explicit period values", () => {
    expect(parseTransactionsSearch({ period: "mtd" })).toEqual({
      period: undefined,
      transactionId: undefined,
    });
  });
});

describe("getDefaultTransactionsPeriodValue", () => {
  test("defaults transactions to the current UTC month", () => {
    expect(
      getDefaultTransactionsPeriodValue(new Date("2026-05-14T19:00:00.000Z")),
    ).toBe("2026-05");
  });
});

describe("parseTransactionsExplicitPeriod", () => {
  test("parses month and year periods with labels", () => {
    expect(parseTransactionsExplicitPeriod("2026-03")).toEqual({
      value: "2026-03",
      granularity: "month",
      year: 2026,
      month: 2,
      label: "March 2026",
    });
    expect(parseTransactionsExplicitPeriod("2026")).toEqual({
      value: "2026",
      granularity: "year",
      year: 2026,
      month: null,
      label: "2026",
    });
  });
});
