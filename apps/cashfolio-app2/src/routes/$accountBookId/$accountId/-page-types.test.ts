import { describe, expect, test } from "vitest";
import {
  normalizeLedgerPeriodValue,
  parseLedgerExplicitPeriod,
  parseLedgerSearch,
} from "./-page-types";

describe("normalizeLedgerPeriodValue", () => {
  test("keeps explicit month and year period values", () => {
    expect(normalizeLedgerPeriodValue("2026-02")).toBe("2026-02");
    expect(normalizeLedgerPeriodValue("2026")).toBe("2026");
  });

  test("normalizes case and trims whitespace", () => {
    expect(normalizeLedgerPeriodValue("  2026-02 ")).toBe("2026-02");
    expect(normalizeLedgerPeriodValue(" 2026 ")).toBe("2026");
  });

  test("rejects unsupported or invalid period values", () => {
    expect(normalizeLedgerPeriodValue("mtd")).toBeUndefined();
    expect(normalizeLedgerPeriodValue("last-year")).toBeUndefined();
    expect(normalizeLedgerPeriodValue("2026-13")).toBeUndefined();
    expect(normalizeLedgerPeriodValue("invalid")).toBeUndefined();
  });
});

describe("parseLedgerSearch", () => {
  test("keeps supported search values", () => {
    expect(
      parseLedgerSearch({
        transactionId: "tx-1",
        period: "2026-02",
      }),
    ).toEqual({
      transactionId: "tx-1",
      period: "2026-02",
    });
  });

  test("drops unsupported period values", () => {
    expect(parseLedgerSearch({ period: "mtd" })).toEqual({
      transactionId: undefined,
      period: undefined,
    });
  });
});

describe("parseLedgerExplicitPeriod", () => {
  test("parses explicit month periods", () => {
    expect(parseLedgerExplicitPeriod("2026-02")).toEqual({
      value: "2026-02",
      granularity: "month",
      year: 2026,
      month: 1,
      label: "February 2026",
    });
  });

  test("parses explicit year periods", () => {
    expect(parseLedgerExplicitPeriod("2026")).toEqual({
      value: "2026",
      granularity: "year",
      year: 2026,
      month: null,
      label: "2026",
    });
  });
});
