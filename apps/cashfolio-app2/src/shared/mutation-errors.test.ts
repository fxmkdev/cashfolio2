import { describe, expect, it } from "vitest";
import { ACCOUNT_BOOK_BUSY_MESSAGE, getMutationError } from "./mutation-errors";

describe("mutation error feedback", () => {
  it("only offers safe retry for a confirmed busy-book rollback", () => {
    expect(getMutationError(new Error(ACCOUNT_BOOK_BUSY_MESSAGE))).toEqual({
      message: ACCOUNT_BOOK_BUSY_MESSAGE,
      isBusy: true,
      isUncertainOutcome: false,
    });
    expect(getMutationError(new Error("Account is archived"))).toEqual({
      message: "Account is archived",
      isBusy: false,
      isUncertainOutcome: false,
    });
    expect(getMutationError(null).message).toBe(
      "The change could not be saved.",
    );
  });
  it.each([
    new TypeError("Failed to fetch"),
    new Error("Network error"),
    new DOMException("Aborted", "AbortError"),
  ])("explains uncertainty after network failure: %s", (error) => {
    expect(getMutationError(error)).toMatchObject({
      isBusy: false,
      isUncertainOutcome: true,
    });
    expect(getMutationError(error).message).toContain(
      "check the saved data before submitting again",
    );
  });
});
