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

  it("loads valuation cache units", async () => {
    const result = await loadValuationCachePageData();

    expect(getValuationCacheUnits).toHaveBeenCalledTimes(1);
    expect(getValuationCacheUnits).toHaveBeenCalledWith({
      data: {},
    });
    expect(result).toEqual({
      currencyUnits: [],
      cryptocurrencyUnits: [],
      securityUnits: [],
    });
  });
});
