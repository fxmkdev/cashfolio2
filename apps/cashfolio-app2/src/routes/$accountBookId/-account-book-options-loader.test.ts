import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserAccountBooks = vi.hoisted(() => vi.fn());

vi.mock("@/server/home", () => ({
  getUserAccountBooks,
}));

import {
  invalidateCachedUserAccountBooks,
  loadUserAccountBooksForAccountBookRoute,
  resetCachedUserAccountBooksForTests,
} from "./-account-book-options-loader";

describe("loadUserAccountBooksForAccountBookRoute", () => {
  beforeEach(() => {
    getUserAccountBooks.mockReset();
    resetCachedUserAccountBooksForTests();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    resetCachedUserAccountBooksForTests();
  });

  it("does not cache server-side calls", async () => {
    getUserAccountBooks
      .mockResolvedValueOnce([{ id: "book-1", name: "Alpha" }])
      .mockResolvedValueOnce([{ id: "book-2", name: "Beta" }]);

    await loadUserAccountBooksForAccountBookRoute();
    await loadUserAccountBooksForAccountBookRoute();

    expect(getUserAccountBooks).toHaveBeenCalledTimes(2);
  });

  it("caches client-side calls", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    const books = [{ id: "book-1", name: "Alpha" }];
    getUserAccountBooks.mockResolvedValue(books);

    const first = await loadUserAccountBooksForAccountBookRoute();
    const second = await loadUserAccountBooksForAccountBookRoute();

    expect(first).toEqual(books);
    expect(second).toEqual(books);
    expect(getUserAccountBooks).toHaveBeenCalledTimes(1);
  });

  it("resets cached promise when a client-side request fails", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    getUserAccountBooks
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([{ id: "book-3", name: "Gamma" }]);

    await expect(loadUserAccountBooksForAccountBookRoute()).rejects.toThrow(
      "network",
    );
    const result = await loadUserAccountBooksForAccountBookRoute();

    expect(result).toEqual([{ id: "book-3", name: "Gamma" }]);
    expect(getUserAccountBooks).toHaveBeenCalledTimes(2);
  });

  it("allows client-side cache invalidation between calls", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    getUserAccountBooks
      .mockResolvedValueOnce([{ id: "book-1", name: "Alpha" }])
      .mockResolvedValueOnce([{ id: "book-1", name: "Renamed" }]);

    const first = await loadUserAccountBooksForAccountBookRoute();
    invalidateCachedUserAccountBooks();
    const second = await loadUserAccountBooksForAccountBookRoute();

    expect(first).toEqual([{ id: "book-1", name: "Alpha" }]);
    expect(second).toEqual([{ id: "book-1", name: "Renamed" }]);
    expect(getUserAccountBooks).toHaveBeenCalledTimes(2);
  });
});
