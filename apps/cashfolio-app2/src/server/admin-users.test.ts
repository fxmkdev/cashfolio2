import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "../.prisma-client/enums";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      validator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async (args?: { data: unknown }) => {
          const inputData = args && "data" in args ? args.data : undefined;
          const validatedData = validate ? validate(inputData) : inputData;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureUserHasRole = vi.hoisted(() => vi.fn());
const ensureUser = vi.hoisted(() => vi.fn());
const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());
const getLogtoUser = vi.hoisted(() => vi.fn());
const getLogtoUsers = vi.hoisted(() => vi.fn());
const deleteLogtoUser = vi.hoisted(() => vi.fn());
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
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../users/functions.server", () => ({
  ensureUser,
  ensureUserHasRole,
}));

vi.mock("../auth/logto-management.server", () => ({
  deleteLogtoUser,
  getLogtoUser,
  getLogtoUsers,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("./account-deletion-redis", () => ({
  deleteBookScopedRedisDataForAccountBooks,
}));

import {
  deleteAdminUser,
  ensureAdminAccess,
  getAdminUsers,
  getCurrentUserCanAccessAdmin,
  updateAdminUserRoles,
  validateDeleteAdminUserInput,
  validateUpdateAdminUserRolesInput,
} from "./admin-users";

function createUser(args: {
  id: string;
  externalId: string;
  roles: UserRole[];
  accountBookCount: number;
}) {
  return {
    id: args.id,
    externalId: args.externalId,
    roles: args.roles,
    locale: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    _count: {
      accountBookLinks: args.accountBookCount,
    },
  };
}

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

describe("admin users server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue({
      id: "current-user",
      roles: [UserRole.ADMIN],
    });
    ensureUserHasRole.mockResolvedValue({
      id: "admin-user",
      roles: [UserRole.ADMIN],
    });
    getLogtoUser.mockImplementation(async (externalId: string) => ({
      id: externalId,
      username: `${externalId}-username`,
      primaryEmail: `${externalId}@example.test`,
      name: `Name ${externalId}`,
      avatar: `https://example.test/${externalId}.png`,
      lastSignInAt: null,
    }));
    getLogtoUsers.mockImplementation(async (externalIds: string[]) => {
      return new Map(
        externalIds.map((externalId) => [
          externalId,
          {
            id: externalId,
            username: `${externalId}-username`,
            primaryEmail: `${externalId}@example.test`,
            name: `Name ${externalId}`,
            avatar: `https://example.test/${externalId}.png`,
            lastSignInAt: null,
          },
        ]),
      );
    });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockImplementation(async ({ data, where }) =>
      createUser({
        id: where.id,
        externalId: "external-updated",
        roles: data.roles,
        accountBookCount: 2,
      }),
    );
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.user.deleteMany.mockResolvedValue({ count: 1 });
    tx.accountBook.deleteMany.mockResolvedValue({ count: 1 });
    deleteBookScopedRedisDataForAccountBooks.mockResolvedValue(undefined);
    deleteLogtoUser.mockResolvedValue(undefined);
  });

  it("lists all database users with account-book counts", async () => {
    ensureUserHasRole.mockResolvedValueOnce({
      id: "user-1",
      roles: [UserRole.ADMIN],
    });
    prisma.user.findMany.mockResolvedValueOnce([
      createUser({
        id: "user-1",
        externalId: "logto-1",
        roles: [UserRole.ADMIN],
        accountBookCount: 3,
      }),
      createUser({
        id: "user-2",
        externalId: "logto-2",
        roles: [],
        accountBookCount: 0,
      }),
    ]);

    await expect(getAdminUsers()).resolves.toEqual([
      {
        id: "user-1",
        externalId: "logto-1",
        displayName: "Name logto-1",
        email: "logto-1@example.test",
        username: "logto-1-username",
        avatarUrl: "https://example.test/logto-1.png",
        identityStatus: "available",
        roles: [UserRole.ADMIN],
        accountBookCount: 3,
        isCurrentUser: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "user-2",
        externalId: "logto-2",
        displayName: "Name logto-2",
        email: "logto-2@example.test",
        username: "logto-2-username",
        avatarUrl: "https://example.test/logto-2.png",
        identityStatus: "available",
        roles: [],
        accountBookCount: 0,
        isCurrentUser: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);

    expect(ensureUserHasRole).toHaveBeenCalledWith(UserRole.ADMIN);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        externalId: true,
        roles: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            accountBookLinks: true,
          },
        },
      },
    });
    expect(getLogtoUsers).toHaveBeenCalledTimes(1);
    expect(getLogtoUsers).toHaveBeenCalledWith(["logto-1", "logto-2"]);
    expect(getLogtoUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin access", async () => {
    const error = new Response("Forbidden", { status: 403 });
    ensureUserHasRole.mockRejectedValueOnce(error);

    await expect(getAdminUsers()).rejects.toBe(error);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("enforces Admin access for the admin route shell", async () => {
    await expect(ensureAdminAccess()).resolves.toBeUndefined();

    expect(ensureUserHasRole).toHaveBeenCalledWith(UserRole.ADMIN);
  });

  it("preserves the 403 response thrown by the admin guard", async () => {
    const error = new Response("Forbidden", { status: 403 });
    ensureUserHasRole.mockRejectedValueOnce(error);

    await expect(ensureAdminAccess()).rejects.toBe(error);
  });

  it("returns whether the current user can access Admin", async () => {
    await expect(getCurrentUserCanAccessAdmin()).resolves.toBe(true);

    ensureUser.mockResolvedValueOnce({
      id: "current-user",
      roles: [],
    });

    await expect(getCurrentUserCanAccessAdmin()).resolves.toBe(false);
  });

  it("keeps Logto-missing users visible with fallback identity fields", async () => {
    getLogtoUsers.mockResolvedValueOnce(new Map());
    prisma.user.findMany.mockResolvedValueOnce([
      createUser({
        id: "user-1",
        externalId: "missing-logto-user",
        roles: [],
        accountBookCount: 0,
      }),
    ]);

    await expect(getAdminUsers()).resolves.toMatchObject([
      {
        id: "user-1",
        externalId: "missing-logto-user",
        displayName: "missing-logto-user",
        email: null,
        username: null,
        avatarUrl: null,
        identityStatus: "missing",
      },
    ]);
  });

  it("keeps Logto-unavailable users visible with fallback identity fields", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = new Error("Logto unavailable");
    getLogtoUsers.mockRejectedValueOnce(error);
    prisma.user.findMany.mockResolvedValueOnce([
      createUser({
        id: "user-1",
        externalId: "unavailable-logto-user",
        roles: [],
        accountBookCount: 0,
      }),
    ]);

    await expect(getAdminUsers()).resolves.toMatchObject([
      {
        id: "user-1",
        externalId: "unavailable-logto-user",
        displayName: "unavailable-logto-user",
        email: null,
        username: null,
        avatarUrl: null,
        identityStatus: "unavailable",
      },
    ]);
    expect(consoleWarn).toHaveBeenCalledWith(
      "Failed to load Logto user identities for Admin Users.",
      {
        error,
        userCount: 1,
      },
    );
    consoleWarn.mockRestore();
  });

  it("updates another user's roles", async () => {
    await expect(
      updateAdminUserRoles({
        data: {
          userId: "user-2",
          roles: [UserRole.ADMIN],
        },
      }),
    ).resolves.toMatchObject({
      id: "user-2",
      roles: [UserRole.ADMIN],
      accountBookCount: 2,
    });

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-2" },
        data: { roles: [UserRole.ADMIN] },
      }),
    );
  });

  it("marks the current admin when updating their own roles", async () => {
    await expect(
      updateAdminUserRoles({
        data: {
          userId: "admin-user",
          roles: [UserRole.ADMIN],
        },
      }),
    ).resolves.toMatchObject({
      id: "admin-user",
      roles: [UserRole.ADMIN],
      isCurrentUser: true,
    });
  });

  it("rejects invalid role values", () => {
    expect(() =>
      validateUpdateAdminUserRolesInput({
        userId: "user-1",
        roles: ["OWNER"],
      }),
    ).toThrow("Roles contain an unsupported value.");
  });

  it("rejects invalid delete input", () => {
    expect(() =>
      validateDeleteAdminUserInput({
        userId: "user-1",
        confirmation: "",
      }),
    ).toThrow("Confirmation is required.");
  });

  it("rejects removing the current admin's Admin role", async () => {
    await expect(
      updateAdminUserRoles({
        data: {
          userId: "admin-user",
          roles: [],
        },
      }),
    ).rejects.toThrow("You cannot remove your own Admin role.");

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects removing the final Admin role", async () => {
    prisma.user.count.mockResolvedValueOnce(0);

    await expect(
      updateAdminUserRoles({
        data: {
          userId: "last-admin",
          roles: [],
        },
      }),
    ).rejects.toThrow("At least one Admin user is required.");

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { not: "last-admin" },
        roles: { has: UserRole.ADMIN },
      },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("deletes another user and reuses account deletion cleanup", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "target-user",
        externalId: "logto-target",
        roles: [],
        accountBookCount: 2,
      }),
      accountBookLinks: [
        createAccountBookLink({
          id: "private-book",
          name: "Private Book",
          userLinkCount: 1,
        }),
        createAccountBookLink({
          id: "shared-book",
          name: "Shared Book",
          userLinkCount: 2,
        }),
      ],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "logto-target@example.test",
        },
      }),
    ).resolves.toBeUndefined();

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(ensureUserHasRole).toHaveBeenCalledWith(UserRole.ADMIN);
    expect(deleteBookScopedRedisDataForAccountBooks).toHaveBeenCalledWith([
      "private-book",
    ]);
    expect(deleteLogtoUser.mock.invocationCallOrder[0]).toBeLessThan(
      deleteBookScopedRedisDataForAccountBooks.mock.invocationCallOrder[0],
    );
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { externalId: "logto-target" },
    });
    expect(tx.accountBook.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["private-book"] },
        userLinks: { none: {} },
      },
    });
    expect(deleteLogtoUser).toHaveBeenCalledWith("logto-target");
  });

  it("deletes a database user when the Logto identity is missing", async () => {
    getLogtoUser.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "target-user",
        externalId: "missing-logto-user",
        roles: [],
        accountBookCount: 0,
      }),
      accountBookLinks: [],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "missing-logto-user",
        },
      }),
    ).resolves.toBeUndefined();

    expect(deleteBookScopedRedisDataForAccountBooks).toHaveBeenCalledWith([]);
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { externalId: "missing-logto-user" },
    });
    expect(tx.accountBook.deleteMany).not.toHaveBeenCalled();
    expect(deleteLogtoUser).toHaveBeenCalledWith("missing-logto-user");
  });

  it("deletes a Logto user without email by confirming the external id", async () => {
    getLogtoUser.mockResolvedValueOnce({
      id: "logto-no-email",
      username: "no-email-username",
      primaryEmail: null,
      name: "No Email",
      avatar: null,
      lastSignInAt: null,
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "target-user",
        externalId: "logto-no-email",
        roles: [],
        accountBookCount: 0,
      }),
      accountBookLinks: [],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "logto-no-email",
        },
      }),
    ).resolves.toBeUndefined();

    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { externalId: "logto-no-email" },
    });
    expect(deleteLogtoUser).toHaveBeenCalledWith("logto-no-email");
  });

  it("rejects deletion when the Logto identity is unavailable", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = new Error("Logto unavailable");
    getLogtoUser.mockRejectedValueOnce(error);
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "target-user",
        externalId: "unavailable-logto-user",
        roles: [],
        accountBookCount: 0,
      }),
      accountBookLinks: [],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "unavailable-logto-user",
        },
      }),
    ).rejects.toThrow(
      "Cannot delete user because the Logto identity is unavailable.",
    );

    expect(deleteLogtoUser).not.toHaveBeenCalled();
    expect(deleteBookScopedRedisDataForAccountBooks).not.toHaveBeenCalled();
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "Failed to load Logto user identity.",
      {
        error,
        externalId: "unavailable-logto-user",
      },
    );
    consoleWarn.mockRestore();
  });

  it("rejects deleting the current admin", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "admin-user",
        externalId: "logto-admin",
        roles: [UserRole.ADMIN],
        accountBookCount: 0,
      }),
      accountBookLinks: [],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "admin-user",
          confirmation: "logto-admin@example.test",
        },
      }),
    ).rejects.toThrow("You cannot delete yourself.");

    expect(deleteBookScopedRedisDataForAccountBooks).not.toHaveBeenCalled();
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
    expect(deleteLogtoUser).not.toHaveBeenCalled();
  });

  it("rejects deleting the final Admin user", async () => {
    prisma.user.count.mockResolvedValueOnce(0);
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "last-admin",
        externalId: "logto-last-admin",
        roles: [UserRole.ADMIN],
        accountBookCount: 0,
      }),
      accountBookLinks: [],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "last-admin",
          confirmation: "logto-last-admin@example.test",
        },
      }),
    ).rejects.toThrow("At least one Admin user is required.");

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { not: "last-admin" },
        roles: { has: UserRole.ADMIN },
      },
    });
    expect(getLogtoUser).not.toHaveBeenCalled();
    expect(deleteBookScopedRedisDataForAccountBooks).not.toHaveBeenCalled();
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
    expect(deleteLogtoUser).not.toHaveBeenCalled();
  });

  it("rejects an external-id confirmation when the Logto email is available", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "target-user",
        externalId: "logto-target",
        roles: [],
        accountBookCount: 0,
      }),
      accountBookLinks: [],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "logto-target",
        },
      }),
    ).rejects.toThrow("Confirmation does not match the user.");

    expect(deleteBookScopedRedisDataForAccountBooks).not.toHaveBeenCalled();
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
    expect(deleteLogtoUser).not.toHaveBeenCalled();
  });

  it("rejects a delete confirmation that does not match the required value", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      ...createUser({
        id: "target-user",
        externalId: "logto-target",
        roles: [],
        accountBookCount: 0,
      }),
      accountBookLinks: [],
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "wrong@example.test",
        },
      }),
    ).rejects.toThrow("Confirmation does not match the user.");

    expect(deleteBookScopedRedisDataForAccountBooks).not.toHaveBeenCalled();
    expect(tx.user.deleteMany).not.toHaveBeenCalled();
    expect(deleteLogtoUser).not.toHaveBeenCalled();
  });

  it("rejects admin deletion before database lookup when same-origin check fails", async () => {
    const error = new Error("Invalid origin");
    ensureSameOriginRequestFromServerContext.mockImplementationOnce(() => {
      throw error;
    });

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "target@example.test",
        },
      }),
    ).rejects.toBe(error);

    expect(ensureUserHasRole).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects admin deletion for non-admin users", async () => {
    const error = new Response("Forbidden", { status: 403 });
    ensureUserHasRole.mockRejectedValueOnce(error);

    await expect(
      deleteAdminUser({
        data: {
          userId: "target-user",
          confirmation: "target@example.test",
        },
      }),
    ).rejects.toBe(error);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
