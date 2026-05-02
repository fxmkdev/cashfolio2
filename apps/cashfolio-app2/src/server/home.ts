import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureUser } from "../users/functions.server";

export type UserAccountBookOption = {
  id: string;
  name: string;
};

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

export const getUserAccountBooks = createServerFn({
  method: "GET",
}).handler(async (): Promise<UserAccountBookOption[]> => {
  const user = await ensureUser();

  const links = await prisma.userAccountBookLink.findMany({
    where: { userId: user.id },
    select: {
      accountBook: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      accountBook: {
        name: "asc",
      },
    },
  });

  return links.map((link) => link.accountBook);
});
