import { beforeEach, describe, expect, it, vi } from "vitest";

const getAccountBookSettings = vi.hoisted(() => vi.fn());

vi.mock("@/server/account-books", () => ({
  getAccountBookSettings,
}));

import { loadAccountBookSettingsPageData } from "./-page-loader";

describe("loadAccountBookSettingsPageData", () => {
  beforeEach(() => {
    getAccountBookSettings.mockReset();
    getAccountBookSettings.mockResolvedValue({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      startDate: "2026-01-01T00:00:00.000Z",
    });
  });

  it("loads account-book settings for the selected account book", async () => {
    const result = await loadAccountBookSettingsPageData({
      accountBookId: "book-1",
    });

    expect(getAccountBookSettings).toHaveBeenCalledTimes(1);
    expect(getAccountBookSettings).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
      },
    });
    expect(result).toEqual({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
  });
});
