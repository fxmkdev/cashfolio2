import { DEFAULT_EXTERNAL_ID, prisma } from "./db-client";

export async function getUserAccountBooks(externalId = DEFAULT_EXTERNAL_ID) {
  return prisma.accountBook.findMany({
    where: {
      userLinks: {
        some: {
          user: {
            externalId,
          },
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      referenceCurrency: true,
      startDate: true,
    },
  });
}

export async function getAccountsForAccountBook(accountBookId: string) {
  return prisma.account.findMany({
    where: { accountBookId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      equityAccountSubtype: true,
    },
  });
}
