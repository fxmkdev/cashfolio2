import { describe, expect, it } from "vitest";
import { isDeleteAccountBookConfirmationMatch } from "./-page-view";

describe("isDeleteAccountBookConfirmationMatch", () => {
  it("requires the account book name to match exactly", () => {
    expect(
      isDeleteAccountBookConfirmationMatch({
        confirmationName: "My Book",
        accountBookName: "My Book",
      }),
    ).toBe(true);

    expect(
      isDeleteAccountBookConfirmationMatch({
        confirmationName: "my book",
        accountBookName: "My Book",
      }),
    ).toBe(false);
  });

  it("trims surrounding confirmation whitespace", () => {
    expect(
      isDeleteAccountBookConfirmationMatch({
        confirmationName: "  My Book  ",
        accountBookName: "My Book",
      }),
    ).toBe(true);
  });
});
