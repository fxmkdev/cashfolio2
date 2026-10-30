import type { UserRole } from "../.prisma-client/enums";
import { ensureAuthenticated } from "../auth/functions.server";
import { prisma } from "../prisma.server";

export async function ensureUser() {
  const userContext = await ensureAuthenticated();
  if (!userContext.claims?.sub)
    throw new Response("Forbidden", { status: 403 });
  const user = __E2E_BUILD__
    ? await import("../e2e/user.server").then(({ getOrCreateUser }) =>
        getOrCreateUser(userContext),
      )
    : await prisma.user.findUnique({
        where: { externalId: userContext.claims?.sub },
      });
  if (!user || user.deletionPending)
    throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function ensureUserHasRole(role: UserRole) {
  const user = await ensureUser();

  if (user.deletionPending || !user.roles.includes(role)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return user;
}
