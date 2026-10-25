import type { GroupTreeOption } from "@/components/account-tree/group-tree-select";
import {
  getAccountMoveError,
  type MoveAccount,
  type MoveAccountGroup,
} from "@/shared/bulk-account-move";
import type { TreeRow } from "./-page-types";
import { isBulkAccount } from "./-bulk-account-targets";

export const NO_GROUP_VALUE = "__no_group__";

export function getMoveAccountsData(rows: TreeRow[], accountIds: string[]) {
  const ids = new Set(accountIds);
  const accounts: MoveAccount[] = rows
    .filter((row) => isBulkAccount(row) && ids.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      unit: row.unit,
      groupId: row.groupId ?? null,
      isActive: row.isActive,
      isCashAccount: row.isCashAccount ?? false,
    }));
  const groups: MoveAccountGroup[] = rows
    .filter(
      (row) => row.nodeType === "accountGroup" && !row.isVirtualArchivedGroup,
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      parentGroupId:
        (row.persistedParentId === undefined
          ? row.parentId
          : row.persistedParentId) ?? null,
      isActive: row.isActive,
      isCashAccount: row.isCashAccount ?? false,
    }));
  return { accounts, groups };
}

export function buildMoveGroupOptions(
  accounts: MoveAccount[],
  groups: MoveAccountGroup[],
): GroupTreeOption[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  return [
    { value: NO_GROUP_VALUE, label: "No Group" },
    ...groups
      .filter((group) => !getAccountMoveError(accounts, group))
      .map((group) => {
        const path = [group.name];
        const seen = new Set([group.id]);
        let parentId = group.parentGroupId;
        while (parentId && !seen.has(parentId)) {
          seen.add(parentId);
          const parent = byId.get(parentId);
          if (!parent) break;
          path.unshift(parent.name);
          parentId = parent.parentGroupId;
        }
        return {
          value: group.id,
          label: path.join(" / "),
          parentGroupId: group.parentGroupId,
          treePath: path.slice(0, -1),
          treeLabel: group.name,
        };
      }),
  ];
}
