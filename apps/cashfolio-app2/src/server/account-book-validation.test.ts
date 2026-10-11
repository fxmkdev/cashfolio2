import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateCreateAccountBookInput,
  validateDeleteAccountBookInput,
  validateUpdateAccountBookSettingsInput,
} from "./account-book-validation";

const book = {
  name: "  Book  ",
  referenceCurrency: "chf",
  startDate: "2026-01-01",
};

describe("account book input contracts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10"));
  });
  afterEach(() => vi.useRealTimers());

  it("normalizes supported date and text inputs", () => {
    for (const startDate of [book.startDate, new Date(book.startDate)]) {
      expect(
        validateCreateAccountBookInput({ ...book, startDate, ignored: true }),
      ).toEqual({
        name: "Book",
        referenceCurrency: "CHF",
        startDate: new Date("2026-01-01"),
      });
    }
    expect(
      validateUpdateAccountBookSettingsInput({
        ...book,
        accountBookId: "book-1",
      }),
    ).toEqual({
      accountBookId: "book-1",
      name: "Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01"),
    });
    expect(
      validateDeleteAccountBookInput({
        accountBookId: "book-1",
        confirmationName: " Book ",
        ignored: true,
      }),
    ).toEqual({ accountBookId: "book-1", confirmationName: "Book" });
  });

  it.each([
    ["name", null],
    ["name", " "],
    ["referenceCurrency", []],
    ["referenceCurrency", "UNKNOWN"],
    ["startDate", undefined],
    ["startDate", 123],
    ["startDate", "invalid"],
    ["startDate", new Date(NaN)],
    ["startDate", "2026-01-11"],
  ])("rejects malformed %s (%j)", (field, value) => {
    const input = { ...book, [field as string]: value };
    expect(() => validateCreateAccountBookInput(input)).toThrow();
    expect(() =>
      validateUpdateAccountBookSettingsInput({
        ...input,
        accountBookId: "book-1",
      }),
    ).toThrow();
  });

  it("requires identifiers and deletion confirmation", () => {
    expect(() => validateUpdateAccountBookSettingsInput(book)).toThrow(
      "Account book id is required.",
    );
    expect(() =>
      validateDeleteAccountBookInput({
        accountBookId: "book-1",
        confirmationName: 1,
      }),
    ).toThrow("Account book name confirmation is required.");
    expect(() =>
      validateDeleteAccountBookInput({
        accountBookId: "book-1",
        confirmationName: " ",
      }),
    ).toThrow("Account book name confirmation is required.");
  });

  it.each([null, [], false])("rejects non-object inputs (%j)", (input) => {
    for (const validate of [
      validateCreateAccountBookInput,
      validateUpdateAccountBookSettingsInput,
      validateDeleteAccountBookInput,
    ]) {
      expect(() => validate(input)).toThrow("Input must be an object.");
    }
  });
});
