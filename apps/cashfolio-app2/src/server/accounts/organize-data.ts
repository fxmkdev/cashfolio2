import { createHash } from "node:crypto";
import type { Prisma } from "../../.prisma-client/client";
import type {
  OrganizeNode,
  OrganizeSnapshot,
} from "../../shared/account-organize/types";

export function organizeVersion(nodes: OrganizeNode[]) {
  return createHash("sha256")
    .update(JSON.stringify(nodes.toSorted((a, b) => a.id.localeCompare(b.id))))
    .digest("hex");
}

export async function readOrganizeSnapshot(
  tx: Prisma.TransactionClient,
  accountBookId: string,
): Promise<OrganizeSnapshot> {
  const [accounts, groups] = await Promise.all([
    tx.account.findMany({
      where: { accountBookId, type: "BALANCE" },
      select: {
        id: true,
        name: true,
        groupId: true,
        sortOrder: true,
        isActive: true,
        isCashAccount: true,
        unit: true,
      },
    }),
    tx.accountGroup.findMany({
      where: { accountBookId, type: "BALANCE" },
      select: {
        id: true,
        name: true,
        parentGroupId: true,
        sortOrder: true,
        isActive: true,
        isCashAccount: true,
      },
    }),
  ]);
  const nodes: OrganizeNode[] = [
    ...accounts.map(({ groupId, ...node }) => ({
      ...node,
      parentId: groupId,
      nodeType: "account" as const,
    })),
    ...groups.map(({ parentGroupId, ...node }) => ({
      ...node,
      parentId: parentGroupId,
      nodeType: "accountGroup" as const,
      unit: null,
    })),
  ];
  return { nodes, version: organizeVersion(nodes) };
}

export const ORGANIZE_STALE_MESSAGE =
  "The account hierarchy changed. Refresh and try the move again.";

export function assertOrganizeVersion(
  snapshot: OrganizeSnapshot,
  expected: string,
) {
  if (snapshot.version !== expected) throw new Error(ORGANIZE_STALE_MESSAGE);
}
