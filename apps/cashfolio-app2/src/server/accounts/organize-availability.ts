import type { AccountOrganizeScope } from "../../shared/account-organize/scope";
import type { Prisma } from "../../.prisma-client/client";
import type {
  OrganizeNode,
  OrganizeSnapshot,
} from "../../shared/account-organize/types";
import { moneyIsZero } from "../../shared/money";
import { hasInactiveAncestorGroup } from "./accounts-helpers";
import {
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
  getGroupArchiveAvailability,
  getGroupDeleteAvailability,
  getGroupUnarchiveAvailability,
} from "./account-tree-rules";

export async function readOrganizeAvailability(
  tx: Prisma.TransactionClient,
  accountBookId: string,
  nodes: OrganizeNode[],
  scope: AccountOrganizeScope = "balance",
): Promise<OrganizeSnapshot["actionAvailability"]> {
  const bookings = await tx.booking.groupBy({
    by: ["accountId"],
    where: {
      accountBookId,
      accountId: {
        in: nodes
          .filter((node) => node.nodeType === "account")
          .map((node) => node.id),
      },
    },
    _count: true,
    _sum: { value: true },
  });
  const bookingById = new Map(bookings.map((row) => [row.accountId, row]));
  const groups = new Map(
    nodes
      .filter((node) => node.nodeType === "accountGroup")
      .map((node) => [node.id, { ...node, parentGroupId: node.parentId }]),
  );
  const children = new Map<string, OrganizeNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  return Object.fromEntries(
    nodes.map((node) => {
      const childNodes = children.get(node.id) ?? [];
      const hasInactiveAncestor = hasInactiveAncestorGroup(
        node.parentId,
        groups,
      );
      const archive =
        node.nodeType === "account"
          ? getAccountArchiveAvailability({
              isActive: node.isActive,
              hasZeroBalance:
                scope !== "balance" ||
                moneyIsZero(bookingById.get(node.id)?._sum.value ?? 0),
            })
          : getGroupArchiveAvailability({
              isActive: node.isActive,
              hasActiveChildAccounts: childNodes.some(
                (child) => child.nodeType === "account" && child.isActive,
              ),
              hasActiveChildGroups: childNodes.some(
                (child) => child.nodeType === "accountGroup" && child.isActive,
              ),
            });
      const unarchive =
        node.nodeType === "account"
          ? getAccountUnarchiveAvailability({
              isActive: node.isActive,
              hasInactiveAncestor,
            })
          : getGroupUnarchiveAvailability({
              isActive: node.isActive,
              hasInactiveAncestor,
            });
      const remove =
        node.nodeType === "account"
          ? getAccountDeleteAvailability(
              (bookingById.get(node.id)?._count ?? 0) > 0,
            )
          : getGroupDeleteAvailability({
              hasChildAccounts: childNodes.some(
                (child) => child.nodeType === "account",
              ),
              hasChildGroups: childNodes.some(
                (child) => child.nodeType === "accountGroup",
              ),
            });
      return [
        node.id,
        {
          archivable: archive.enabled,
          archiveDisabledReason: archive.disabledReason,
          unarchivable: unarchive.enabled,
          unarchiveDisabledReason: unarchive.disabledReason,
          deletable: remove.enabled,
          deleteDisabledReason: remove.disabledReason,
        },
      ];
    }),
  );
}
