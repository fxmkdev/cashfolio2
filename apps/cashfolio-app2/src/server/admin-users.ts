import { createServerFn } from "@tanstack/react-start";
import { UserRole } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import { ensureUser, ensureUserHasRole } from "../users/functions.server";
import {
  assertRecord,
  requireArrayField,
  requireStringField,
} from "./input-validation";
import {
  deleteAdminUserById,
  type DeleteAdminUserInput,
} from "./admin-user-deletion.server";
import {
  loadLogtoIdentities,
  loadLogtoIdentity,
  type LogtoIdentityResult,
  type LogtoIdentityStatus,
} from "./admin-user-identities.server";

export type AdminUserListItem = {
  id: string;
  externalId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  identityStatus: LogtoIdentityStatus;
  roles: UserRole[];
  accountBookCount: number;
  isCurrentUser: boolean;
  createdAt: string;
  updatedAt: string;
};

type UpdateAdminUserRolesInput = {
  userId: string;
  roles: UserRole[];
};

type AdminUserRecord = {
  id: string;
  externalId: string;
  roles: UserRole[];
  createdAt: Date;
  updatedAt: Date;
  _count: {
    accountBookLinks: number;
  };
};

const USER_ROLES = new Set<string>(Object.values(UserRole));

async function toAdminUserListItem(
  user: AdminUserRecord,
  identity?: LogtoIdentityResult,
  isCurrentUser = false,
): Promise<AdminUserListItem> {
  const resolvedIdentity = identity ?? (await loadLogtoIdentity(user));

  return {
    id: user.id,
    externalId: user.externalId,
    displayName: resolvedIdentity.displayName,
    email: resolvedIdentity.email,
    username: resolvedIdentity.username,
    avatarUrl: resolvedIdentity.avatarUrl,
    identityStatus: resolvedIdentity.status,
    roles: user.roles,
    accountBookCount: user._count.accountBookLinks,
    isCurrentUser,
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

export function validateDeleteAdminUserInput(
  data: unknown,
): DeleteAdminUserInput {
  assertRecord(data);

  return {
    userId: requireStringField(data, "userId", "User id is required."),
    confirmation: requireStringField(
      data,
      "confirmation",
      "Confirmation is required.",
    ),
  };
}

export const getAdminUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminUserListItem[]> => {
    const currentUser = await ensureUserHasRole(UserRole.ADMIN);

    const users = await prisma.user.findMany({
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

    const identities = await loadLogtoIdentities(users);
    return await Promise.all(
      users.map((user) =>
        toAdminUserListItem(
          user,
          identities.get(user.externalId),
          user.id === currentUser.id,
        ),
      ),
    );
  },
);

export const ensureAdminAccess = createServerFn({ method: "GET" }).handler(
  async (): Promise<void> => {
    await ensureUserHasRole(UserRole.ADMIN);
  },
);

export const getCurrentUserCanAccessAdmin = createServerFn({
  method: "GET",
}).handler(async (): Promise<boolean> => {
  const user = await ensureUser();
  return user.roles.includes(UserRole.ADMIN);
});

export const updateAdminUserRoles = createServerFn({ method: "POST" })
  .validator(validateUpdateAdminUserRolesInput)
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
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            accountBookLinks: true,
          },
        },
      },
    });

    return await toAdminUserListItem(
      updatedUser,
      undefined,
      updatedUser.id === currentAdmin.id,
    );
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .validator(validateDeleteAdminUserInput)
  .handler(async ({ data }): Promise<void> => {
    ensureSameOriginRequestFromServerContext();
    const currentAdmin = await ensureUserHasRole(UserRole.ADMIN);

    await deleteAdminUserById({
      currentAdminId: currentAdmin.id,
      data,
    });
  });
