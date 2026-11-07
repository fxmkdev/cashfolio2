import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccountBookOption } from "@/server/home";

const getUserAccountBooks = vi.hoisted(() => vi.fn());

vi.mock("@/server/home", () => ({
  getUserAccountBooks,
}));

import {
  invalidateCachedUserAccountBooks,
  loadUserAccountBooks,
  resetCachedUserAccountBooksForTests,
} from "./options";

describe("loadUserAccountBooks", () => {
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

    await loadUserAccountBooks();
    await loadUserAccountBooks();

    expect(getUserAccountBooks).toHaveBeenCalledTimes(2);
  });

  it("caches client-side calls", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    const books = [{ id: "book-1", name: "Alpha" }];
    getUserAccountBooks.mockResolvedValue(books);

    const first = await loadUserAccountBooks();
    const second = await loadUserAccountBooks();

    expect(first).toEqual(books);
    expect(second).toEqual(books);
    expect(getUserAccountBooks).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight client-side request", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    const books = [{ id: "book-1", name: "Alpha" }];
    let resolveRequest!: (value: UserAccountBookOption[]) => void;
    getUserAccountBooks.mockReturnValue(
      new Promise<UserAccountBookOption[]>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const first = loadUserAccountBooks();
    const second = loadUserAccountBooks();
    // Let both calls reach the server-function import before resolving it.
    await vi.waitFor(() =>
      expect(getUserAccountBooks).toHaveBeenCalledTimes(1),
    );
    resolveRequest(books);

    expect(await Promise.all([first, second])).toEqual([books, books]);
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

    await expect(loadUserAccountBooks()).rejects.toThrow("network");
    const result = await loadUserAccountBooks();

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

    const first = await loadUserAccountBooks();
    invalidateCachedUserAccountBooks();
    const second = await loadUserAccountBooks();

    expect(first).toEqual([{ id: "book-1", name: "Alpha" }]);
    expect(second).toEqual([{ id: "book-1", name: "Renamed" }]);
    expect(getUserAccountBooks).toHaveBeenCalledTimes(2);
  });
});
