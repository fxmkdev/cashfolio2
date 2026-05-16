import type { LogtoContext } from "@logto/node";
import type { UserRole } from "../.prisma-client/enums";
import { ensureAuthenticated } from "../auth/functions.server";
import { prisma } from "../prisma.server";

const userLookupByExternalId = new Map<
  string,
  Promise<Awaited<ReturnType<typeof upsertUserByExternalId>>>
>();

export async function getOrCreateUser(userContext: LogtoContext) {
  if (!userContext.claims) {
    throw new Error("No user claims");
  }

  const externalId = userContext.claims.sub;
  const inFlightLookup = userLookupByExternalId.get(externalId);
  if (inFlightLookup) {
    return await inFlightLookup;
  }

  const lookup = upsertUserByExternalId(externalId).finally(() => {
    userLookupByExternalId.delete(externalId);
  });
  userLookupByExternalId.set(externalId, lookup);

  return await lookup;
}

async function upsertUserByExternalId(externalId: string) {
  try {
    return await prisma.user.upsert({
      where: { externalId },
      create: { externalId },
      update: {},
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const user = await prisma.user.findUnique({ where: { externalId } });
    if (!user) {
      throw error;
    }

    return user;
  }
}

export async function ensureUser() {
  const userContext = await ensureAuthenticated();
  const user = await getOrCreateUser(userContext);
  return user;
}

export async function ensureUserHasRole(role: UserRole) {
  const user = await ensureUser();

  if (!user.roles.includes(role)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return user;
}

function isUniqueConstraintError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const data = error as {
    code?: unknown;
  };

  return data.code === "P2002";
}
