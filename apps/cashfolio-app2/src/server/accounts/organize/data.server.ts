import {
  accountOrganizeFilter,
  type AccountOrganizeScope,
} from "../../../shared/accounts/organize/scope";
import { createHash } from "node:crypto";
import { readOrganizeAvailability } from "./availability.server";
import type { Prisma } from "../../../.prisma-client/client";
import type {
  OrganizeNode,
  OrganizeSnapshot,
} from "../../../shared/accounts/organize/types";

export function organizeVersion(nodes: OrganizeNode[]) {
  return createHash("sha256")
    .update(JSON.stringify(nodes.toSorted((a, b) => a.id.localeCompare(b.id))))
    .digest("hex");
}

export async function readOrganizeSnapshot(
  tx: Prisma.TransactionClient,
  accountBookId: string,
  scope: AccountOrganizeScope = "balance",
): Promise<OrganizeSnapshot> {
  const [accounts, groups] = await Promise.all([
    tx.account.findMany({
      where: { accountBookId, ...accountOrganizeFilter(scope) },
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
      where: { accountBookId, ...accountOrganizeFilter(scope) },
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
  return {
    nodes,
    version: organizeVersion(nodes),
    actionAvailability: await readOrganizeAvailability(
      tx,
      accountBookId,
      nodes,
      scope,
    ),
  };
}

export const ORGANIZE_STALE_MESSAGE =
  "The hierarchy changed. Refresh and try the move again.";

export function assertOrganizeVersion(
  snapshot: OrganizeSnapshot,
  expected: string,
) {
  if (snapshot.version !== expected) throw new Error(ORGANIZE_STALE_MESSAGE);
}
