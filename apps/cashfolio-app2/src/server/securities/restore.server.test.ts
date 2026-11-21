import { beforeEach, expect, test, vi } from "vitest";
const search = vi.hoisted(() => vi.fn());
vi.mock("./discovery.server", () => ({ searchListings: search }));
import { restoreSecurity } from "./restore.server";
beforeEach(() => {
  vi.clearAllMocks();
});
test("restoration requests only one exact-symbol/MIC page and returns its newly signed row", async () => {
  const exact = { symbol: " BRK B ", mic: "XNYS", selectionToken: "fresh" };
  search.mockResolvedValue({
    rows: [{ ...exact, symbol: "BRKB" }, { ...exact, mic: "XNAS" }, exact],
    totalCount: 1000,
  });
  expect(await restoreSecurity({ symbol: " BRK B ", mic: "XNYS" })).toBe(exact);
  expect(search).toHaveBeenCalledExactlyOnceWith({
    criteria: { query: " BRK B ", exchange: "XNYS" },
    offset: 0,
    limit: 20,
  });
});
test("substring results and alternate exchanges cannot repair a missing identity by scanning", async () => {
  search.mockResolvedValue({
    rows: [
      { symbol: "ABC", mic: "XNAS" },
      { symbol: "A", mic: "XNYS" },
    ],
    totalCount: 10000,
  });
  expect(await restoreSecurity({ symbol: "A", mic: "XNAS" })).toBeNull();
  expect(search).toHaveBeenCalledTimes(1);
});
test("a missing MIC requires an exact missing-MIC row", async () => {
  search.mockResolvedValue({
    rows: [
      { symbol: "A", mic: "XNAS" },
      { symbol: "A", mic: null },
    ],
    totalCount: 2,
  });
  expect(await restoreSecurity({ symbol: "A", mic: null })).toEqual({
    symbol: "A",
    mic: null,
  });
  expect(search).toHaveBeenCalledWith({
    criteria: { query: "A", exchange: null },
    offset: 0,
    limit: 20,
  });
});
test("cancellation and provider failures propagate without an alternative request", async () => {
  const error = new DOMException("Aborted", "AbortError");
  search.mockRejectedValue(error);
  await expect(restoreSecurity({ symbol: "A", mic: null })).rejects.toBe(error);
  expect(search).toHaveBeenCalledTimes(1);
});
