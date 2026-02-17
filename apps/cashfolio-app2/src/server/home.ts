import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureUser } from "../users/functions.server";

export const getFirstUserAccountBookId = createServerFn({
  method: "GET",
}).handler(async () => {
  const user = await ensureUser();

  const link = await prisma.userAccountBookLink.findFirst({
    where: { userId: user.id },
    select: { accountBookId: true },
  });

  return link?.accountBookId ?? null;
});
