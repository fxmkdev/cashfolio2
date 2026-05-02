import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserAccountBooks = vi.hoisted(() => vi.fn());

vi.mock("@/server/home", () => ({
  getUserAccountBooks,
}));

import {
  invalidateCachedUserAccountBooks,
  loadUserAccountBooksForAccountsRoute,
  resetCachedUserAccountBooksForTests,
} from "./-account-book-options-loader";

describe("loadUserAccountBooksForAccountsRoute", () => {
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

    await loadUserAccountBooksForAccountsRoute();
    await loadUserAccountBooksForAccountsRoute();

    expect(getUserAccountBooks).toHaveBeenCalledTimes(2);
  });

  it("caches client-side calls", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    const books = [{ id: "book-1", name: "Alpha" }];
    getUserAccountBooks.mockResolvedValue(books);

    const first = await loadUserAccountBooksForAccountsRoute();
    const second = await loadUserAccountBooksForAccountsRoute();

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

    await expect(loadUserAccountBooksForAccountsRoute()).rejects.toThrow(
      "network",
    );
    const result = await loadUserAccountBooksForAccountsRoute();

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

    const first = await loadUserAccountBooksForAccountsRoute();
    invalidateCachedUserAccountBooks();
    const second = await loadUserAccountBooksForAccountsRoute();

    expect(first).toEqual([{ id: "book-1", name: "Alpha" }]);
    expect(second).toEqual([{ id: "book-1", name: "Renamed" }]);
    expect(getUserAccountBooks).toHaveBeenCalledTimes(2);
  });
});
