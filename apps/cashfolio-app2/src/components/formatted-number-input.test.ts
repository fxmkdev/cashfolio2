import { describe, expect, test } from "vitest";
import { getNumberFormatSymbols } from "./formatted-number-input";

describe("getNumberFormatSymbols", () => {
  test("resolves locale-specific decimal and grouping symbols", () => {
    expect(getNumberFormatSymbols("en-US")).toEqual({
      thousandSeparator: ",",
      decimalSeparator: ".",
    });
    expect(getNumberFormatSymbols("de-CH")).toEqual({
      thousandSeparator: "’",
      decimalSeparator: ".",
    });
    expect(getNumberFormatSymbols("fr-FR")).toEqual({
      thousandSeparator: " ",
      decimalSeparator: ",",
    });
  });
});
