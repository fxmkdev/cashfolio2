import { notFound, rootRouteId } from "@tanstack/react-router";
import { prisma } from "../prisma.server";
import { ensureUser } from "../users/functions.server";

export async function ensureAuthorizedForAccountBookId(accountBookId: string) {
  const user = await ensureUser();

  const link = await prisma.userAccountBookLink.findUnique({
    where: {
      userId_accountBookId: {
        userId: user.id,
        accountBookId,
      },
    },
  });

  if (!link) {
    throw notFound({ routeId: rootRouteId });
  }

  return link;
}
