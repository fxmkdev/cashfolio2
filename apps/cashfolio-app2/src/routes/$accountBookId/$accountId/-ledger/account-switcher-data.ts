import type { TreeNodeData } from "@mantine/core";
import { AccountType } from "@/.prisma-client/enums";
import { sortAccountHierarchyNodes } from "@/shared/accounts/account-hierarchy-order";

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

type NavigationNode = {
  id: string;
  nodeType: "account" | "accountGroup";
  parentId: string | undefined;
  name: string;
  sortOrder: number | null;
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
    (account) => account.type === AccountType.BALANCE && account.isActive,
  );
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const neededGroupIds = new Set<string>();
  for (const account of financialAccounts) {
    let groupId = account.groupId;
    while (groupId && groupsById.has(groupId) && !neededGroupIds.has(groupId)) {
      neededGroupIds.add(groupId);
      groupId = groupsById.get(groupId)!.parentGroupId;
    }
  }
  const groupValue = (id: string | null) => (id ? `group:${id}` : undefined);
  const nodes = sortAccountHierarchyNodes<NavigationNode>([
    ...groups
      .filter((group) => neededGroupIds.has(group.id))
      .map((group): NavigationNode => ({
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
  ]);
  const parentIdById = new Map(nodes.map((node) => [node.id, node.parentId]));
  const treeNodeById = new Map<string, TreeNodeData>(
    nodes.map((node) => [node.id, { value: node.id, label: node.name }]),
  );
  const data: TreeNodeData[] = [];
  const ancestorsByAccountId = new Map<string, string[]>();

  for (const node of nodes) {
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
