import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => ({
    handler: vi.fn((handler: () => unknown) => handler),
  })),
);

const ensureUser = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  userAccountBookLink: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../users/functions.server", () => ({
  ensureUser,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import { getFirstUserAccountBookId, getUserAccountBooks } from "./home";

describe("home server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue({ id: "user-1" });
  });

  it("loads the first account book with deterministic ordering", async () => {
    prisma.userAccountBookLink.findFirst.mockResolvedValue({
      accountBookId: "book-a",
    });

    await expect(getFirstUserAccountBookId()).resolves.toBe("book-a");

    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(prisma.userAccountBookLink.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { accountBookId: true },
      orderBy: [
        {
          accountBook: {
            name: "asc",
          },
        },
        { accountBookId: "asc" },
      ],
    });
  });

  it("returns null when the user has no account books", async () => {
    prisma.userAccountBookLink.findFirst.mockResolvedValue(null);

    await expect(getFirstUserAccountBookId()).resolves.toBeNull();
  });

  it("loads account-book options ordered by name", async () => {
    prisma.userAccountBookLink.findMany.mockResolvedValue([
      { accountBook: { id: "book-a", name: "Alpha" } },
      { accountBook: { id: "book-b", name: "Beta" } },
    ]);

    await expect(getUserAccountBooks()).resolves.toEqual([
      { id: "book-a", name: "Alpha" },
      { id: "book-b", name: "Beta" },
    ]);

    expect(prisma.userAccountBookLink.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        accountBook: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        accountBook: {
          name: "asc",
        },
      },
    });
  });
});
