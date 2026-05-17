import { createServerFn } from "@tanstack/react-start";
import { UserRole } from "../.prisma-client/enums";
import {
  getLogtoUser,
  getLogtoUsers,
  type LogtoManagementUser,
} from "../auth/logto-management.server";
import { prisma } from "../prisma.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import { ensureUser, ensureUserHasRole } from "../users/functions.server";
import {
  assertRecord,
  requireArrayField,
  requireStringField,
} from "./input-validation";

type LogtoIdentityStatus = "available" | "missing" | "unavailable";

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
  createdAt: string;
  updatedAt: string;
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

type UpdateAdminUserRolesInput = {
  userId: string;
  roles: UserRole[];
};

const USER_ROLES = new Set<string>(Object.values(UserRole));

type LogtoIdentityResult =
  | {
      status: "available";
      displayName: string;
      email: string | null;
      username: string | null;
      avatarUrl: string | null;
    }
  | {
      status: "missing" | "unavailable";
      displayName: string;
      email: null;
      username: null;
      avatarUrl: null;
    };

function getUnavailableIdentity(user: AdminUserRecord): LogtoIdentityResult {
  return {
    status: "unavailable",
    displayName: user.externalId,
    email: null,
    username: null,
    avatarUrl: null,
  };
}

function getLogtoIdentityResult(
  user: AdminUserRecord,
  logtoUser: LogtoManagementUser | null | undefined,
): LogtoIdentityResult {
  if (!logtoUser) {
    return {
      status: "missing",
      displayName: user.externalId,
      email: null,
      username: null,
      avatarUrl: null,
    };
  }

  return {
    status: "available",
    displayName:
      logtoUser.name ??
      logtoUser.primaryEmail ??
      logtoUser.username ??
      user.externalId,
    email: logtoUser.primaryEmail,
    username: logtoUser.username,
    avatarUrl: logtoUser.avatar,
  };
}

function logLogtoIdentityFailure(
  message: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  console.warn(message, { ...context, error });
}

async function loadLogtoIdentity(user: AdminUserRecord) {
  try {
    return getLogtoIdentityResult(user, await getLogtoUser(user.externalId));
  } catch (error) {
    logLogtoIdentityFailure("Failed to load Logto user identity.", error, {
      externalId: user.externalId,
    });
    return getUnavailableIdentity(user);
  }
}

async function toAdminUserListItem(
  user: AdminUserRecord,
  identity?: LogtoIdentityResult,
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
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function loadLogtoIdentities(
  users: AdminUserRecord[],
): Promise<Map<string, LogtoIdentityResult>> {
  if (users.length === 0) {
    return new Map();
  }

  try {
    const logtoUsersById = await getLogtoUsers(
      users.map((user) => user.externalId),
    );

    return new Map(
      users.map((user) => [
        user.externalId,
        getLogtoIdentityResult(user, logtoUsersById.get(user.externalId)),
      ]),
    );
  } catch (error) {
    logLogtoIdentityFailure(
      "Failed to load Logto user identities for Admin Users.",
      error,
      { userCount: users.length },
    );

    return new Map(
      users.map((user) => [user.externalId, getUnavailableIdentity(user)]),
    );
  }
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
        toAdminUserListItem(user, identities.get(user.externalId)),
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
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            accountBookLinks: true,
          },
        },
      },
    });

    return await toAdminUserListItem(updatedUser);
  });
