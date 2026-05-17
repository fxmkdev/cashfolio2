import { createServerFn } from "@tanstack/react-start";
import { UserRole } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import { ensureUserHasRole } from "../users/functions.server";
import {
  assertRecord,
  requireArrayField,
  requireStringField,
} from "./input-validation";

export type AdminUserListItem = {
  id: string;
  externalId: string;
  roles: UserRole[];
  locale: string | null;
  accountBookCount: number;
  createdAt: string;
  updatedAt: string;
};

type AdminUserRecord = {
  id: string;
  externalId: string;
  roles: UserRole[];
  locale: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    accountBookLinks: number;
  };
};

type UpdateAdminUserRolesInput = {
  userId: string;
  roles: UserRole[];
};

const USER_ROLES = new Set<string>(Object.values(UserRole));

function toAdminUserListItem(user: AdminUserRecord): AdminUserListItem {
  return {
    id: user.id,
    externalId: user.externalId,
    roles: user.roles,
    locale: user.locale,
    accountBookCount: user._count.accountBookLinks,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function validateUpdateAdminUserRolesInput(
  data: unknown,
): UpdateAdminUserRolesInput {
  assertRecord(data);
  const userId = requireStringField(data, "userId", "User id is required.");
  const roleValues = requireArrayField(data, "roles", "Roles are required.");
  const roles: UserRole[] = [];

  for (const role of roleValues) {
    if (typeof role !== "string" || !USER_ROLES.has(role)) {
      throw new Error("Roles contain an unsupported value.");
    }

    if (!roles.includes(role as UserRole)) {
      roles.push(role as UserRole);
    }
  }

  return { userId, roles };
}

export const getAdminUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminUserListItem[]> => {
    await ensureUserHasRole(UserRole.ADMIN);

    const users = await prisma.user.findMany({
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

    return users.map(toAdminUserListItem);
  },
);

export const ensureAdminAccess = createServerFn({ method: "GET" }).handler(
  async (): Promise<void> => {
    await ensureUserHasRole(UserRole.ADMIN);
  },
);

export const updateAdminUserRoles = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateAdminUserRolesInput)
  .handler(async ({ data }): Promise<AdminUserListItem> => {
    ensureSameOriginRequestFromServerContext();
    const currentAdmin = await ensureUserHasRole(UserRole.ADMIN);

    if (
      data.userId === currentAdmin.id &&
      !data.roles.includes(UserRole.ADMIN)
    ) {
      throw new Error("You cannot remove your own Admin role.");
    }

    if (!data.roles.includes(UserRole.ADMIN)) {
      const remainingAdminCount = await prisma.user.count({
        where: {
          id: { not: data.userId },
          roles: { has: UserRole.ADMIN },
        },
      });

      if (remainingAdminCount === 0) {
        throw new Error("At least one Admin user is required.");
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: data.userId },
      data: { roles: data.roles },
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

    return toAdminUserListItem(updatedUser);
  });
