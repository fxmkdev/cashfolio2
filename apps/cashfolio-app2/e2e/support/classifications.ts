import type { Prisma, PrismaClient } from "../../src/.prisma-client/client";
export async function createClassifiedAccounts(
  db: PrismaClient,
  accounts: Array<
    Prisma.AccountCreateManyInput & { assetClassId?: string | null }
  >,
) {
  return db.$transaction(async (tx) => {
    const result = await tx.account.createMany({
      data: accounts.map(
        ({ assetClassId: _assetClassId, ...account }) => account,
      ),
    });
    const assignments = accounts
      .filter((a) => a.assetClassId)
      .map((a) => ({
        accountId: a.id!,
        accountBookId: a.accountBookId,
        schemeId: "assetClass",
        nodeId: a.assetClassId!,
      }));
    if (assignments.length)
      await tx.accountClassification.createMany({ data: assignments });
    return result;
  });
}
