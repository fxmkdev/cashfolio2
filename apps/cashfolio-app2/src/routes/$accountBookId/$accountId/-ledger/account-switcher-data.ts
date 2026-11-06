import type { TreeNodeData } from "@mantine/core";
import { AccountType } from "@/.prisma-client/enums";
import { sortAccountHierarchyNodes } from "@/shared/account-hierarchy-order";
import {
  projectArchivedAccountHierarchy,
  type ArchiveHierarchyNode,
} from "@/shared/archived-account-hierarchy";

type NavigationAccount = {
  id: string;
  name: string;
  type: AccountType;
  groupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

export type NavigationGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

type NavigationNode = ArchiveHierarchyNode & {
  name: string;
  sortOrder: number | null;
  isVirtualArchivedGroup?: boolean;
};

export type LedgerAccountSwitcherData = {
  data: TreeNodeData[];
  accountIds: Set<string>;
  ancestorsByAccountId: Map<string, string[]>;
};

export function buildLedgerAccountSwitcherData({
  accounts,
  groups,
}: {
  accounts: NavigationAccount[];
  groups: NavigationGroup[];
}): LedgerAccountSwitcherData {
  const financialAccounts = accounts.filter(
    (account) => account.type === AccountType.BALANCE,
  );
  const groupValue = (id: string | null) => (id ? `group:${id}` : undefined);
  const nodes: NavigationNode[] = [
    ...groups.map((group): NavigationNode => ({
      ...group,
      id: groupValue(group.id)!,
      parentId: groupValue(group.parentGroupId),
      nodeType: "accountGroup",
    })),
    ...financialAccounts.map((account): NavigationNode => ({
      ...account,
      parentId: groupValue(account.groupId),
      nodeType: "account",
    })),
  ];
  const { parentIdById, archivedGroups } =
    projectArchivedAccountHierarchy(nodes);
  const projectedNodes = sortAccountHierarchyNodes<NavigationNode>([
    ...nodes.map((node) => ({
      ...node,
      parentId: parentIdById.get(node.id),
    })),
    ...archivedGroups.map(({ id, parentId }): NavigationNode => ({
      id,
      parentId,
      name: "Archived",
      nodeType: "accountGroup",
      isActive: false,
      sortOrder: null,
      isVirtualArchivedGroup: true,
    })),
  ]);
  const treeNodeById = new Map<string, TreeNodeData>(
    projectedNodes.map((node) => [
      node.id,
      { value: node.id, label: node.name },
    ]),
  );
  const data: TreeNodeData[] = [];
  const ancestorsByAccountId = new Map<string, string[]>();

  for (const node of projectedNodes) {
    const treeNode = treeNodeById.get(node.id)!;
    const ancestors: string[] = [];
    let parentId = node.parentId;
    while (parentId && treeNodeById.has(parentId)) {
      ancestors.unshift(parentId);
      parentId = parentIdById.get(parentId);
    }
    treeNode.nodeProps = {
      searchLabel: [...ancestors, node.id]
        .map((id) => treeNodeById.get(id)!.label)
        .join(" / "),
    };
    if (node.nodeType === "account") {
      ancestorsByAccountId.set(node.id, ancestors);
    }
    const parent = node.parentId && treeNodeById.get(node.parentId);
    if (parent) {
      parent.children ??= [];
      parent.children.push(treeNode);
    } else {
      data.push(treeNode);
    }
  }

  for (const node of projectedNodes) {
    const treeNode = treeNodeById.get(node.id)!;
    if (node.nodeType === "accountGroup" && !treeNode.children?.length) {
      treeNode.nodeProps!.disabled = true;
    }
  }

  return {
    data,
    accountIds: new Set(financialAccounts.map((account) => account.id)),
    ancestorsByAccountId,
  };
}

export function filterLedgerAccountNode(query: string, node: TreeNodeData) {
  return String(node.nodeProps?.searchLabel ?? node.label)
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}
