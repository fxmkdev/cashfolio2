import { Prisma } from "../.prisma-client/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureAuthenticated = vi.hoisted(() => vi.fn());
const deleteLogtoUser = vi.hoisted(() => vi.fn());
const destroyLogtoSession = vi.hoisted(() => vi.fn());
const deleteBookScopedRedisDataForAccountBooks = vi.hoisted(() => vi.fn());

const tx = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  accountBook: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
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
    accountBookId: args.id,
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
    vi.resetAllMocks();
    ensureAuthenticated.mockResolvedValue({
      isAuthenticated: true,
      claims: {
        sub: "logto-user-1",
        email: "user@example.test",
      },
    });
    tx.$executeRaw.mockResolvedValue(0);
    tx.$queryRaw.mockResolvedValue([]);
    tx.user.findUnique.mockImplementation(async (args) => {
      const user = await prisma.user.findUnique(args);
      return user
        ? {
            ...user,
            roles: user.roles ?? [],
            deletionPending: user.deletionPending ?? true,
          }
        : null;
    });
    tx.user.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.user.deleteMany.mockResolvedValue({ count: 1 });
    tx.accountBook.findMany.mockResolvedValue([{ id: "book-1" }]);
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
    prisma.user.findUnique.mockResolvedValue({
      accountBookLinks: [
        { accountBookId: "book-2" },
        { accountBookId: "book-1" },
      ],
    });
    await expect(
      deleteApplicationUserData({ externalId: "logto-user-1" }),
    ).resolves.toEqual(["book-1"]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.user.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      tx.user.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.accountBook.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["book-1", "book-2"] }, userLinks: { none: {} } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
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

  it("cleans Redis for actually deleted books only after database commit", async () => {
    let committed = false;
    prisma.$transaction.mockImplementation(async (callback) => {
      committed = false;
      const result = await callback(tx);
      committed = true;
      return result;
    });
    deleteBookScopedRedisDataForAccountBooks.mockImplementation(async () => {
      expect(committed).toBe(true);
      expect(tx.accountBook.deleteMany).toHaveBeenCalledOnce();
    });
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

  it("returns no deleted books when the user is already gone", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      deleteApplicationUserData({ externalId: "missing" }),
    ).resolves.toEqual([]);
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
    expect(tx.accountBook.deleteMany).not.toHaveBeenCalled();
  });

  it("requires a deletion reservation before removing application data", async () => {
    prisma.user.findUnique.mockResolvedValue({ deletionPending: false });
    await expect(
      deleteApplicationUserData({ externalId: "logto-user-1" }),
    ).rejects.toThrow("Account deletion is pending");
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes a user without books without searching for unrelated orphans", async () => {
    prisma.user.findUnique.mockResolvedValue({ accountBookLinks: [] });
    await expect(
      deleteApplicationUserData({ externalId: "logto-user-1" }),
    ).resolves.toEqual([]);
    expect(tx.user.deleteMany).toHaveBeenCalledOnce();
    expect(tx.accountBook.findMany).not.toHaveBeenCalled();
  });

  it("preserves books that still have members", async () => {
    prisma.user.findUnique.mockResolvedValue({
      accountBookLinks: [{ accountBookId: "shared" }],
    });
    tx.accountBook.findMany.mockResolvedValue([]);
    await expect(
      deleteApplicationUserData({ externalId: "logto-user-1" }),
    ).resolves.toEqual([]);
    expect(tx.accountBook.deleteMany).not.toHaveBeenCalled();
  });

  it("does not clean Redis when database cleanup rolls back", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      accountBookLinks: [{ accountBookId: "book-1" }],
    });
    prisma.$transaction
      .mockImplementationOnce(async (callback) => callback(tx))
      .mockImplementationOnce(async (callback) => {
        await callback(tx);
        throw new Error("commit failed");
      });
    await expect(deleteAuthenticatedAccount()).rejects.toThrow("commit failed");
    expect(deleteBookScopedRedisDataForAccountBooks).not.toHaveBeenCalled();
  });
  it("retries rolled-back user deletion without repeating Redis or Logto effects", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      accountBookLinks: [
        createAccountBookLink({
          id: "book-1",
          name: "Private Book",
          userLinkCount: 1,
        }),
      ],
    });
    tx.accountBook.deleteMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock", {
        code: "P2034",
        clientVersion: "test",
      }),
    );
    await deleteAuthenticatedAccount();
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(tx.user.deleteMany).toHaveBeenCalledTimes(2);
    expect(ensureAuthenticated).toHaveBeenCalledOnce();
    expect(deleteBookScopedRedisDataForAccountBooks).toHaveBeenCalledOnce();
    expect(deleteLogtoUser).toHaveBeenCalledExactlyOnceWith("logto-user-1");
    expect(destroyLogtoSession).not.toHaveBeenCalled();
  });
});

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));
