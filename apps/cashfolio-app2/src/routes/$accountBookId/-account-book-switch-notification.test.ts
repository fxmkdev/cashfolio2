import { describe, expect, it } from "vitest";
import {
  consumePendingAccountBookSwitch,
  markPendingAccountBookSwitch,
  PENDING_ACCOUNT_BOOK_SWITCH_KEY,
} from "./-account-book-switch-notification";

function createStorage(initialEntries: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialEntries));

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("account book switch notification marker", () => {
  it("stores and consumes a pending account book switch", () => {
    const storage = createStorage();

    markPendingAccountBookSwitch(
      {
        accountBookId: "book-2",
        accountBookName: "Investments",
      },
      storage,
      1_000,
    );

    expect(consumePendingAccountBookSwitch("book-2", storage, 1_000)).toEqual({
      accountBookId: "book-2",
      accountBookName: "Investments",
    });
    expect(storage.getItem(PENDING_ACCOUNT_BOOK_SWITCH_KEY)).toBeNull();
  });

  it("clears and ignores a pending switch for another account book", () => {
    const storage = createStorage({
      [PENDING_ACCOUNT_BOOK_SWITCH_KEY]: JSON.stringify({
        accountBookId: "book-2",
        accountBookName: "Investments",
        createdAt: 1_000,
      }),
    });

    expect(consumePendingAccountBookSwitch("book-1", storage)).toBeNull();
    expect(storage.getItem(PENDING_ACCOUNT_BOOK_SWITCH_KEY)).toBeNull();
  });

  it("clears and ignores malformed pending switch data", () => {
    const storage = createStorage({
      [PENDING_ACCOUNT_BOOK_SWITCH_KEY]: "{not-json",
    });

    expect(consumePendingAccountBookSwitch("book-1", storage)).toBeNull();
    expect(storage.getItem(PENDING_ACCOUNT_BOOK_SWITCH_KEY)).toBeNull();
  });

  it("clears and ignores stale pending switch data", () => {
    const storage = createStorage({
      [PENDING_ACCOUNT_BOOK_SWITCH_KEY]: JSON.stringify({
        accountBookId: "book-2",
        accountBookName: "Investments",
        createdAt: 1_000,
      }),
    });

    expect(
      consumePendingAccountBookSwitch("book-2", storage, 62_000),
    ).toBeNull();
    expect(storage.getItem(PENDING_ACCOUNT_BOOK_SWITCH_KEY)).toBeNull();
  });

  it("does not throw when storage writes fail", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("set failed");
      },
      removeItem: () => {
        throw new Error("remove failed");
      },
    };

    expect(() =>
      markPendingAccountBookSwitch(
        {
          accountBookId: "book-2",
          accountBookName: "Investments",
        },
        storage,
      ),
    ).not.toThrow();
  });

  it("returns null when storage reads fail", () => {
    const storage = {
      getItem: () => {
        throw new Error("get failed");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(consumePendingAccountBookSwitch("book-2", storage)).toBeNull();
  });

  it("returns null when pending switch cleanup fails", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          accountBookId: "book-2",
          accountBookName: "Investments",
          createdAt: 1_000,
        }),
      setItem: () => undefined,
      removeItem: () => {
        throw new Error("remove failed");
      },
    };

    expect(
      consumePendingAccountBookSwitch("book-2", storage, 1_000),
    ).toBeNull();
  });
});
