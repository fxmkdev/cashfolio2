import { describe, expect, it } from "vitest";
import {
  formatExactNumericTooltipValue,
  resolveFormattedNumericTooltipLabel,
} from "./column-types";

describe("formatExactNumericTooltipValue", () => {
  it("formats with en-CH locale and preserves fractional precision", () => {
    const value = 1234.56789;
    const formatted = formatExactNumericTooltipValue(value);
    const localeParts = new Intl.NumberFormat("en-CH", {
      maximumFractionDigits: 20,
    }).formatToParts(value);
    const groupSeparator = localeParts.find((part) => part.type === "group")?.value;
    const decimalSeparator = localeParts.find(
      (part) => part.type === "decimal",
    )?.value;

    expect(groupSeparator).toBeDefined();
    expect(decimalSeparator).toBeDefined();
    expect(formatted).toContain(`1${groupSeparator}234`);
    expect(formatted).toContain(`${decimalSeparator}56789`);
  });
});

describe("resolveFormattedNumericTooltipLabel", () => {
  it("prefers row exact values keyed by field", () => {
    expect(
      resolveFormattedNumericTooltipLabel({
        colDef: { field: "amount" },
        value: 10.12,
        data: {
          __exactByField: {
            amount: 10.123456,
          },
        },
      }),
    ).toBe("10.123456");
  });

  it("falls back to row exact values keyed by colId", () => {
    expect(
      resolveFormattedNumericTooltipLabel({
        colDef: { colId: "totalGainLoss", field: "ignoredField" },
        value: 5.5,
        data: {
          __exactByField: {
            totalGainLoss: 5.5555,
          },
        },
      }),
    ).toBe("5.5555");
  });

  it("falls back to raw cell value when no exact mapping exists", () => {
    expect(
      resolveFormattedNumericTooltipLabel({
        colDef: { field: "amount" },
        value: 42.125,
        data: {},
      }),
    ).toBe("42.125");
  });

  it("does not fall back when an exact mapping exists but has no numeric value", () => {
    expect(
      resolveFormattedNumericTooltipLabel({
        colDef: { field: "amount" },
        value: 42.125,
        data: {
          __exactByField: {
            amount: null,
          },
        },
      }),
    ).toBeNull();
  });

  it("returns null when neither exact mapping nor numeric raw value is present", () => {
    expect(
      resolveFormattedNumericTooltipLabel({
        colDef: { field: "amount" },
        value: "not-a-number",
        data: {},
      }),
    ).toBeNull();
  });
});
