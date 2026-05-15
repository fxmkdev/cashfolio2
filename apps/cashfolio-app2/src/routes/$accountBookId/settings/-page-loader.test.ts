import { beforeEach, describe, expect, it, vi } from "vitest";

const getAccountBookSettings = vi.hoisted(() => vi.fn());
const getActiveAccountBookUnitUsage = vi.hoisted(() => vi.fn());

vi.mock("@/server/account-books", () => ({
  getAccountBookSettings,
}));

vi.mock("@/server/accounts", () => ({
  getActiveAccountBookUnitUsage,
}));

import { loadSettingsPageData } from "./-page-loader";

describe("loadSettingsPageData", () => {
  beforeEach(() => {
    getAccountBookSettings.mockReset();
    getAccountBookSettings.mockResolvedValue({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    getActiveAccountBookUnitUsage.mockReset();
    getActiveAccountBookUnitUsage.mockResolvedValue({
      currencies: ["CHF", "USD"],
      cryptocurrencies: ["BTC"],
    });
  });

  it("loads account-book settings for the selected account book", async () => {
    const result = await loadSettingsPageData({
      accountBookId: "book-1",
    });

    expect(getAccountBookSettings).toHaveBeenCalledTimes(1);
    expect(getAccountBookSettings).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
      },
    });
    expect(getActiveAccountBookUnitUsage).toHaveBeenCalledTimes(1);
    expect(getActiveAccountBookUnitUsage).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
      },
    });
    expect(result).toEqual({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      unitUsage: { currencies: ["CHF", "USD"], cryptocurrencies: ["BTC"] },
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
  });
});
