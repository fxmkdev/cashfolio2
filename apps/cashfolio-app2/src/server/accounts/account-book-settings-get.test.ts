import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ensureAuthorizedForAccountBookId,
  getAccountBookSettings,
  prisma,
  resetAccountBookSettingsMocks,
  restoreAccountBookSettingsMocks,
} from "./account-book-settings-test-setup";

describe("getAccountBookSettings", () => {
  beforeEach(() => {
    resetAccountBookSettingsMocks();
  });

  afterEach(() => {
    restoreAccountBookSettingsMocks();
  });

  it("loads account-book settings", async () => {
    const result = await getAccountBookSettings({
      data: { accountBookId: "book-1" },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-1" },
      select: {
        id: true,
        name: true,
        referenceCurrency: true,
        startDate: true,
      },
    });
    expect(result).toEqual({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      startDate: "2026-01-03T00:00:00.000Z",
    });
  });
});
