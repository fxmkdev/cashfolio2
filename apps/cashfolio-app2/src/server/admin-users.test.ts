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
const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());
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
  ensureUserHasRole,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import {
  ensureAdminAccess,
  getAdminUsers,
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
    ensureUserHasRole.mockResolvedValue({
      id: "admin-user",
      roles: [UserRole.ADMIN],
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
        roles: [UserRole.ADMIN],
        locale: null,
        accountBookCount: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "user-2",
        externalId: "logto-2",
        roles: [],
        locale: null,
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
        locale: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            accountBookLinks: true,
          },
        },
      },
    });
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
