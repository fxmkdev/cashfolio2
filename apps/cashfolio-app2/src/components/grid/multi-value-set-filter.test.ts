import { describe, expect, test } from "vitest";
import {
  formatMultiValueSetFilterValue,
  getUniqueMultiValueFilterLabels,
  multiValueSetFilterColumn,
} from "./multi-value-set-filter";

describe("multiValueSetFilterColumn", () => {
  test("uses the AG Grid Set Filter", () => {
    expect(multiValueSetFilterColumn.filter).toBe("agSetColumnFilter");
  });
});

describe("formatMultiValueSetFilterValue", () => {
  test("formats array values as comma-separated labels", () => {
    expect(formatMultiValueSetFilterValue({ value: ["CHF", "USD"] })).toBe(
      "CHF, USD",
    );
  });

  test("formats individual set filter values", () => {
    expect(formatMultiValueSetFilterValue({ value: "CHF" })).toBe("CHF");
  });

  test("formats empty values as empty text", () => {
    expect(formatMultiValueSetFilterValue({ value: null })).toBe("");
    expect(formatMultiValueSetFilterValue({ value: undefined })).toBe("");
  });
});

describe("getUniqueMultiValueFilterLabels", () => {
  test("returns visible labels without duplicates or empty values", () => {
    expect(
      getUniqueMultiValueFilterLabels(
        [{ name: "Bank" }, { name: "" }, { name: "Broker" }, { name: "Bank" }],
        (item) => item.name,
      ),
    ).toEqual(["Bank", "Broker"]);
  });
});
