import type { LogtoContext } from "@logto/node";
import type { UserRole } from "../.prisma-client/enums";
import { ensureAuthenticated } from "../auth/functions.server";
import { prisma } from "../prisma.server";

export async function getOrCreateUser(userContext: LogtoContext) {
  if (!userContext.claims) {
    throw new Error("No user claims");
  }

  const user = await prisma.user.upsert({
    where: { externalId: userContext.claims.sub },
    create: { externalId: userContext.claims.sub },
    update: {},
  });

  return user;
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
