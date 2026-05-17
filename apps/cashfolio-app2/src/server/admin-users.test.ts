import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "../.prisma-client/enums";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
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
const prisma = vi.hoisted(() => ({
  user: {
    count: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
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
  getLogtoUser,
  getLogtoUsers,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import {
  ensureAdminAccess,
  getAdminUsers,
  getCurrentUserCanAccessAdmin,
  updateAdminUserRoles,
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
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockImplementation(async ({ data, where }) =>
      createUser({
        id: where.id,
        externalId: "external-updated",
        roles: data.roles,
        accountBookCount: 2,
      }),
    );
  });

  it("lists all database users with account-book counts", async () => {
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

  it("rejects invalid role values", () => {
    expect(() =>
      validateUpdateAdminUserRolesInput({
        userId: "user-1",
        roles: ["OWNER"],
      }),
    ).toThrow("Roles contain an unsupported value.");
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
});
