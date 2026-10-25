import { AccountType } from "@/.prisma-client/enums";
import { isVirtualArchivedGroup } from "./-archived-grid-rows";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  type TreeRow,
} from "./-page-types";

export function isBulkAccountRow(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return (
    !!row &&
    !isReferenceCurrencyTotalFooterRow(row) &&
    row.type === AccountType.BALANCE &&
    !isVirtualArchivedGroup(row)
  );
}

export function isBulkAccount(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return isBulkAccountRow(row) && row.nodeType === "account";
}

export type AccountBulkActionTarget = {
  accountIds: string[];
  archivedCount: number;
};

export function createAccountBulkActionTarget(
  accounts: TreeRow[],
): AccountBulkActionTarget {
  return {
    accountIds: accounts.map((row) => row.id),
    archivedCount: accounts.filter((row) => !row.isActive).length,
  };
}

/** Explicit row IDs mapped to their captured account targets. */
export type BulkAccountSelection = Map<string, string[]>;

/** Follow the displayed hierarchy, including synthetic Archived sections. */
export function getBulkAccountGroupTargets(rows: TreeRow[]) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const targets = new Map<string, string[]>();
  for (const row of rows) {
    if (!isBulkAccount(row)) continue;
    const visited = new Set<string>();
    let parentId = row.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = rowsById.get(parentId);
      if (!parent) break;
      if (isBulkAccountRow(parent)) {
        const accounts = targets.get(parentId) ?? [];
        accounts.push(row.id);
        targets.set(parentId, accounts);
      }
      parentId = parent.parentId;
    }
  }
  return targets;
}

export function reconcileBulkAccountSelection(
  filteredRows: TreeRow[],
  selectedIds: string[],
  previous: BulkAccountSelection,
): BulkAccountSelection {
  const rowsById = new Map(filteredRows.map((row) => [row.id, row]));
  const groupTargets = getBulkAccountGroupTargets(filteredRows);
  const next: BulkAccountSelection = new Map();
  for (const id of selectedIds) {
    const row = rowsById.get(id);
    if (!isBulkAccountRow(row)) continue;
    const current = isBulkAccount(row) ? [id] : (groupTargets.get(id) ?? []);
    const available = new Set(current);
    // A selected group's targets may shrink, but only reselecting can add targets.
    const targets = (previous.get(id) ?? current).filter((accountId) =>
      available.has(accountId),
    );
    if (targets.length) next.set(id, targets);
  }
  return next;
}

export function getBulkAccountSelectionSummary(
  rows: TreeRow[],
  selection: BulkAccountSelection,
) {
  const selectedRows = rows.filter((row) => selection.has(row.id));
  const selectedAccountCount = selectedRows.filter(isBulkAccount).length;
  const selectedGroupCount = selectedRows.length - selectedAccountCount;
  const accountIds = new Set([...selection.values()].flat());
  return {
    selectedAccountCount,
    selectedGroupCount,
    accounts: rows.filter(
      (row) => isBulkAccount(row) && accountIds.has(row.id),
    ),
    canMove: selectedAccountCount > 0 && selectedGroupCount === 0,
  };
}
