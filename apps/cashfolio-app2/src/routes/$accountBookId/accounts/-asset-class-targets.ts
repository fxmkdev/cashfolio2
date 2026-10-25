import { AccountType } from "@/.prisma-client/enums";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  type TreeRow,
} from "./-page-types";

export function isAssetClassAccount(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return (
    !!row &&
    !isReferenceCurrencyTotalFooterRow(row) &&
    row.nodeType === "account" &&
    row.type === AccountType.BALANCE
  );
}

/** Use real parents: archived display wrappers do not change assignment scope. */
export function getGroupAssetClassAccounts(
  rows: TreeRow[],
  groupId: string,
): TreeRow[] {
  const groupIds = new Set([groupId]);
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (row.nodeType !== "accountGroup" || row.isVirtualArchivedGroup) continue;
    const parent =
      row.persistedParentId === undefined
        ? row.parentId
        : row.persistedParentId;
    if (!parent) continue;
    children.set(parent, [...(children.get(parent) ?? []), row.id]);
  }
  const stack = [groupId];
  while (stack.length) {
    for (const id of children.get(stack.pop()!) ?? []) {
      if (groupIds.has(id)) continue;
      groupIds.add(id);
      stack.push(id);
    }
  }
  return rows.filter(
    (row) =>
      isAssetClassAccount(row) && !!row.groupId && groupIds.has(row.groupId),
  );
}

export type AssetClassAssignmentTarget = {
  accountIds: string[];
  archivedCount: number;
  groupName?: string;
};

export function createAssetClassAssignmentTarget(
  accounts: TreeRow[],
  groupName?: string,
): AssetClassAssignmentTarget {
  return {
    accountIds: accounts.map((row) => row.id),
    archivedCount: accounts.filter((row) => !row.isActive).length,
    groupName,
  };
}
