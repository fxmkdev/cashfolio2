import { beforeEach, describe, expect, it, vi } from "vitest";

const getValuationCacheUnits = vi.hoisted(() => vi.fn());

vi.mock("@/server/valuation-cache", () => ({
  getValuationCacheUnits,
}));

import { loadValuationCachePageData } from "./-page-loader";

describe("loadValuationCachePageData", () => {
  beforeEach(() => {
    getValuationCacheUnits.mockReset();
    getValuationCacheUnits.mockResolvedValue({
      currencyUnits: [],
      cryptocurrencyUnits: [],
      securityUnits: [],
    });
  });

  it("loads valuation cache units for the selected account book", async () => {
    const result = await loadValuationCachePageData({
      accountBookId: "book-1",
    });

    expect(getValuationCacheUnits).toHaveBeenCalledTimes(1);
    expect(getValuationCacheUnits).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
      },
    });
    expect(result).toEqual({
      currencyUnits: [],
      cryptocurrencyUnits: [],
      securityUnits: [],
    });
  });
});
