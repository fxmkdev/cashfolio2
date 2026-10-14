import { describe, expect, test } from "vitest";
import { getTransactionCreateDialogText } from "./transaction-create-dialog-text";

describe("getTransactionCreateDialogText", () => {
  test("keeps the normal create dialog wording", () => {
    expect(getTransactionCreateDialogText(false)).toEqual({
      title: "Add Transaction",
      submitLabel: "Create",
    });
  });

  test("uses copy-specific wording for copied transactions", () => {
    expect(getTransactionCreateDialogText(true)).toEqual({
      title: "Copy Transaction",
      submitLabel: "Create Copy",
    });
  });
});
