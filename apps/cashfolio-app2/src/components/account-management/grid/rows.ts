import type { AccountTrackingMethod } from "@/.prisma-client/enums";
import type { AccountTreeRow } from "@/shared/accounts/account-tree";

export type GroupAssetClassSummary = string | null | "Mixed";
/** Source/projection data, including the unchanged server wire representation. */
export type TreeRow = AccountTreeRow & {
  presentationKind?: "assetClass" | "unclassified" | "unit" | "archived";
  accountGroupPath?: string[];
  groupAssetClass?: GroupAssetClassSummary;
  groupTrackingMethod?: AccountTrackingMethod | "Mixed";
};
type PersistedFields = Omit<
  TreeRow,
  "nodeType" | "presentationKind" | "isVirtualArchivedGroup"
> & {
  presentationKind?: never;
  isVirtualArchivedGroup?: false;
};
export type PersistedAccountRow = PersistedFields & {
  rowType: "account";
  nodeType: "account";
};
export type PersistedGroupRow = PersistedFields & {
  rowType: "accountGroup";
  nodeType: "accountGroup";
};
export type PersistedTreeRow = PersistedAccountRow | PersistedGroupRow;
export type DisplayHeadingRow = TreeRow & {
  rowType: "heading";
  nodeType: "accountGroup";
  presentationKind: NonNullable<TreeRow["presentationKind"]>;
};
export type AccountGridTreeRow = PersistedTreeRow | DisplayHeadingRow;
export const REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID =
  "__reference_currency_total_footer__";
export type ReferenceCurrencyTotalFooterRow = {
  id: typeof REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID;
  rowType: "referenceCurrencyTotalFooter";
  name: "Total";
  balanceInReferenceCurrency: number | null;
};
export type AccountsGridRow =
  AccountGridTreeRow | ReferenceCurrencyTotalFooterRow;
export type RowTarget = Pick<PersistedTreeRow, "id" | "nodeType" | "name">;

/** The presentation boundary adapts source data once; mutations accept only persisted variants. */
export function toAccountGridTreeRow(row: TreeRow): AccountGridTreeRow {
  if (row.presentationKind || row.isVirtualArchivedGroup) {
    return {
      ...row,
      rowType: "heading",
      nodeType: "accountGroup",
      presentationKind: row.presentationKind ?? "archived",
    };
  }
  const persisted = {
    ...row,
    presentationKind: undefined,
    isVirtualArchivedGroup: false as const,
  };
  return row.nodeType === "account"
    ? { ...persisted, rowType: "account", nodeType: "account" }
    : { ...persisted, rowType: "accountGroup", nodeType: "accountGroup" };
}

export function isPersistedTreeRow(
  row: TreeRow | AccountsGridRow | undefined,
): row is PersistedTreeRow {
  return (
    !!row &&
    "rowType" in row &&
    (row.rowType === "account" || row.rowType === "accountGroup") &&
    row.rowType === row.nodeType &&
    !row.presentationKind &&
    !row.isVirtualArchivedGroup
  );
}
export function isPersistedAccountRow(
  row: TreeRow | AccountsGridRow | undefined,
): row is PersistedAccountRow {
  return isPersistedTreeRow(row) && row.rowType === "account";
}
export function isPersistedGroupRow(
  row: TreeRow | AccountsGridRow | undefined,
): row is PersistedGroupRow {
  return isPersistedTreeRow(row) && row.rowType === "accountGroup";
}
export function toRowTarget(row: PersistedTreeRow): RowTarget {
  return { id: row.id, nodeType: row.nodeType, name: row.name };
}
export function isReferenceCurrencyTotalFooterRow(
  row: TreeRow | AccountsGridRow | undefined,
): row is ReferenceCurrencyTotalFooterRow {
  return (
    !!row && "rowType" in row && row.rowType === "referenceCurrencyTotalFooter"
  );
}
