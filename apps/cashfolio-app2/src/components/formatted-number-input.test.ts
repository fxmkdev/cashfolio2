import { describe, expect, test } from "vitest";
import { getNumberFormatSymbols } from "./formatted-number-input";

describe("getNumberFormatSymbols", () => {
  test("resolves locale-specific decimal and grouping symbols", () => {
    expect(getNumberFormatSymbols("en-US")).toEqual({
      thousandSeparator: ",",
      decimalSeparator: ".",
    });
    const deChSymbols = getNumberFormatSymbols("de-CH");
    expect(["'", "’"]).toContain(deChSymbols.thousandSeparator);
    expect(deChSymbols.decimalSeparator).toBe(".");
    expect(getNumberFormatSymbols("fr-FR")).toEqual({
      thousandSeparator: " ",
      decimalSeparator: ",",
    });
  });
});
