import type { AccountTreeRow } from "./account-tree";
import { projectArchivedAccountHierarchy } from "./archived-account-hierarchy";

export function buildUnifiedAccountTreeRows(
  rows: AccountTreeRow[],
): AccountTreeRow[] {
  const { parentIdById, archivedGroups } =
    projectArchivedAccountHierarchy(rows);
  const projectedRows = rows.map((row) => ({
    ...row,
    persistedParentId: row.parentId ?? null,
    parentId: parentIdById.get(row.id),
  }));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const virtualRows: AccountTreeRow[] = archivedGroups.map(
    ({ id, parentId }) => ({
      id,
      nodeType: "accountGroup",
      isVirtualArchivedGroup: true,
      name: "Archived",
      type: rowsById.get(parentId ?? "")?.type ?? rows[0]!.type,
      equityAccountSubtype:
        rowsById.get(parentId ?? "")?.equityAccountSubtype ?? null,
      parentId,
      groupId: undefined,
      isActive: false,
      sortOrder: null,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      balance: null,
      balanceInReferenceCurrency: null,
      openingBalance: null,
      deletable: false,
      deleteDisabledReason: undefined,
      archivable: false,
      archiveDisabledReason: undefined,
      unarchivable: false,
      unarchiveDisabledReason: undefined,
    }),
  );
  return [...projectedRows, ...virtualRows];
}
