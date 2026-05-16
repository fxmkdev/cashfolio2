import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureAuthenticated = vi.hoisted(() => vi.fn());
const deleteLogtoUser = vi.hoisted(() => vi.fn());
const destroyLogtoSession = vi.hoisted(() => vi.fn());
const deleteBookScopedRedisDataForAccountBooks = vi.hoisted(() => vi.fn());

const tx = vi.hoisted(() => ({
  user: {
    deleteMany: vi.fn(),
  },
  accountBook: {
    deleteMany: vi.fn(),
  },
}));

const prisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/auth/functions.server", () => ({
  ensureAuthenticated,
}));

vi.mock("@/auth/logto-management.server", () => ({
  deleteLogtoUser,
}));

vi.mock("@/auth/logto.server", () => ({
  destroyLogtoSession,
}));

vi.mock("@/prisma.server", () => ({
  prisma,
}));

vi.mock("./account-deletion-redis", () => ({
  deleteBookScopedRedisDataForAccountBooks,
}));

import { planAccountDeletionFromLinks } from "./account-deletion-plan";
import {
  deleteApplicationUserData,
  deleteAuthenticatedAccount,
  getAccountDeletionPreview,
} from "./account-deletion.server";

function createAccountBookLink(args: {
  id: string;
  name: string;
  userLinkCount: number;
}) {
  return {
    accountBook: {
      id: args.id,
      name: args.name,
      _count: {
        userLinks: args.userLinkCount,
      },
    },
  };
}

describe("account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAuthenticated.mockResolvedValue({
      isAuthenticated: true,
      claims: {
        sub: "logto-user-1",
        email: "user@example.test",
      },
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.user.deleteMany.mockResolvedValue({ count: 1 });
    tx.accountBook.deleteMany.mockResolvedValue({ count: 1 });
    deleteBookScopedRedisDataForAccountBooks.mockResolvedValue(undefined);
    deleteLogtoUser.mockResolvedValue(undefined);
    destroyLogtoSession.mockResolvedValue(undefined);
  });

  it("plans last-linked account books for deletion and shared books for unlinking", () => {
    const plan = planAccountDeletionFromLinks([
      createAccountBookLink({
        id: "book-1",
        name: "Private Book",
        userLinkCount: 1,
      }),
      createAccountBookLink({
        id: "book-2",
        name: "Shared Book",
        userLinkCount: 2,
      }),
    ]);

    expect(plan).toEqual({
      accountBooksToDelete: [{ id: "book-1", name: "Private Book" }],
      accountBooksToUnlink: [{ id: "book-2", name: "Shared Book" }],
    });
  });

  it("returns a deletion preview for the authenticated user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      accountBookLinks: [
        createAccountBookLink({
          id: "book-1",
          name: "Private Book",
          userLinkCount: 1,
        }),
        createAccountBookLink({
          id: "book-2",
          name: "Shared Book",
          userLinkCount: 2,
        }),
      ],
    });

    await expect(getAccountDeletionPreview()).resolves.toEqual({
      displayName: "user@example.test",
      accountBooksToDelete: [{ id: "book-1", name: "Private Book" }],
      accountBooksToUnlink: [{ id: "book-2", name: "Shared Book" }],
    });
  });

  it("deletes the user and only account books that have no remaining links", async () => {
    await deleteApplicationUserData({
      externalId: "logto-user-1",
      accountBookIdsToDelete: ["book-1"],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { externalId: "logto-user-1" },
    });
    expect(tx.accountBook.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["book-1"] },
        userLinks: { none: {} },
      },
    });
  });

  it("cleans Redis for deleted books, deletes app data, and deletes the Logto user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      accountBookLinks: [
        createAccountBookLink({
          id: "book-1",
          name: "Private Book",
          userLinkCount: 1,
        }),
        createAccountBookLink({
          id: "book-2",
          name: "Shared Book",
          userLinkCount: 2,
        }),
      ],
    });

    await deleteAuthenticatedAccount();

    expect(deleteBookScopedRedisDataForAccountBooks).toHaveBeenCalledWith([
      "book-1",
    ]);
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { externalId: "logto-user-1" },
    });
    expect(tx.accountBook.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["book-1"] },
        userLinks: { none: {} },
      },
    });
    expect(deleteLogtoUser).toHaveBeenCalledWith("logto-user-1");
  });
});
