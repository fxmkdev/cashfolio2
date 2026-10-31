import type { Prisma } from "../.prisma-client/client";
import { ASSET_CLASS_SCHEME_ID } from "../shared/asset-class";
export const assetClassSelection = {
  where: { schemeId: ASSET_CLASS_SCHEME_ID },
  select: { nodeId: true },
} as const;
export function withAssetClassId<
  T extends { classifications?: Array<{ nodeId: string }> },
>(account: T) {
  const { classifications, ...rest } = account;
  return { ...rest, assetClassId: classifications?.[0]?.nodeId ?? null };
}
export async function assertAssetClassExists(
  tx: Prisma.TransactionClient,
  accountBookId: string,
  id: string | null | undefined,
) {
  if (id == null) return;
  const node = await tx.classificationNode.findUnique({
    where: {
      id_schemeId_accountBookId: {
        id,
        schemeId: ASSET_CLASS_SCHEME_ID,
        accountBookId,
      },
    },
  });
  if (!node)
    throw new Error(
      "The selected asset class is no longer available. Refresh and choose another class.",
    );
}
export async function writeAssetClass(
  tx: Prisma.TransactionClient,
  accountBookId: string,
  accountIds: string[],
  nodeId: string | null,
) {
  await assertAssetClassExists(tx, accountBookId, nodeId);
  await tx.accountClassification.deleteMany({
    where: {
      accountBookId,
      schemeId: ASSET_CLASS_SCHEME_ID,
      accountId: { in: accountIds },
    },
  });
  if (nodeId)
    await tx.accountClassification.createMany({
      data: accountIds.map((accountId) => ({
        accountId,
        accountBookId,
        schemeId: ASSET_CLASS_SCHEME_ID,
        nodeId,
      })),
    });
}
