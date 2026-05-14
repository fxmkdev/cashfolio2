import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteAccountBook,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  prisma,
  resetAccountBookSettingsMocks,
  restoreAccountBookSettingsMocks,
} from "./account-book-settings-test-setup";

describe("deleteAccountBook", () => {
  beforeEach(() => {
    resetAccountBookSettingsMocks();
  });

  afterEach(() => {
    restoreAccountBookSettingsMocks();
  });

  it("deletes an account book after exact name confirmation", async () => {
    await deleteAccountBook({
      data: {
        accountBookId: "book-1",
        confirmationName: "My Book",
      },
    });

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-1" },
      select: { name: true },
    });
    expect(prisma.accountBook.delete).toHaveBeenCalledWith({
      where: { id: "book-1" },
    });
  });

  it("trims account book delete confirmation without relying on unique names", async () => {
    await deleteAccountBook({
      data: {
        accountBookId: "book-1",
        confirmationName: "  My Book  ",
      },
    });

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-1" },
      select: { name: true },
    });
    expect(prisma.accountBook.delete).toHaveBeenCalledWith({
      where: { id: "book-1" },
    });
  });

  it("rejects missing account book delete confirmation", async () => {
    await expect(
      deleteAccountBook({
        data: {
          accountBookId: "book-1",
          confirmationName: "",
        },
      }),
    ).rejects.toThrow("Account book name confirmation is required.");

    expect(prisma.accountBook.delete).not.toHaveBeenCalled();
  });

  it("rejects mismatched account book delete confirmation", async () => {
    await expect(
      deleteAccountBook({
        data: {
          accountBookId: "book-1",
          confirmationName: "my book",
        },
      }),
    ).rejects.toThrow("Account book name confirmation does not match.");

    expect(prisma.accountBook.delete).not.toHaveBeenCalled();
  });
});
