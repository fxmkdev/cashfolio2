import type { OrganizeNode } from "@/shared/hierarchy-organize/types";
import {
  isPersistedTreeRow,
  isPersistedGroupRow,
  type AccountGridTreeRow,
  type PersistedTreeRow,
} from "./page-types";
import type { AccountsPageViewProps } from "./page-view-types";
import type { useAccountsManagement } from "./use-accounts-management";

export function getHierarchyEditRow(
  rows: AccountGridTreeRow[],
  node: OrganizeNode,
): PersistedTreeRow | undefined {
  const row = rows.find((row) => row.id === node.id);
  if (!isPersistedTreeRow(row)) return undefined;
  return {
    ...row,
    name: node.name,
    parentId: node.parentId ?? undefined,
    persistedParentId: node.parentId,
    groupId:
      node.nodeType === "account" ? (node.parentId ?? undefined) : row.groupId,
    sortOrder: node.sortOrder,
    isActive: node.isActive !== false,
  };
}

export function createHierarchyEditorActions(
  rows: AccountGridTreeRow[],
  onEdit: (row: PersistedTreeRow) => void,
  onAddChild: ReturnType<typeof useAccountsManagement>["onAddChild"],
): Pick<AccountsPageViewProps, "onEditHierarchyNode" | "onAddHierarchyChild"> {
  return {
    onEditHierarchyNode: (node) => {
      const row = getHierarchyEditRow(rows, node);
      if (row) onEdit(row);
    },
    onAddHierarchyChild: (node, kind) => {
      const row = rows.find((row) => row.id === node.id);
      if (isPersistedGroupRow(row)) onAddChild(row, kind);
    },
  };
}
