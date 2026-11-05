import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import {
  ActiveAccountTreeActionsCell,
  ArchivedAccountTreeActionsCell,
} from "@/components/account-tree/account-tree-actions-cells";
import {
  ROOT_PARENT_KEY,
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  toRowTarget,
  type TreeRow,
} from "./-page-types";
import type { RefObject } from "react";
import type { AccountTreeColumnParams } from "./-account-column-types";
type AccountActionsParams = Pick<
  AccountTreeColumnParams,
  | "grouping"
  | "isEquityTab"
  | "categoryType"
  | "onEditRow"
  | "onAddChild"
  | "onUnarchiveRow"
  | "unarchivePending"
  | "onArchiveRow"
  | "onDeleteRow"
  | "onReorderRow"
>;

function renderAccountRowActions({
  data,
  params,
  rowsByParentKey,
}: {
  data: AccountsGridRow | undefined;
  params: AccountActionsParams;
  rowsByParentKey: Map<string, TreeRow[]>;
}) {
  const {
    grouping = "accountStructure",
    isEquityTab,
    categoryType,
    onEditRow,
    onAddChild,
    onUnarchiveRow,
    unarchivePending,
    onArchiveRow,
    onDeleteRow,
    onReorderRow,
  } = params;
  if (!data) return null;
  if (isReferenceCurrencyTotalFooterRow(data)) return null;
  if (data.isVirtualArchivedGroup || data.presentationKind) return null;

  const parentKey = data.parentId ?? ROOT_PARENT_KEY;
  const siblingCount =
    (rowsByParentKey
      .get(parentKey)
      ?.filter((row) => !row.isVirtualArchivedGroup).length ?? 0) - 1;
  const hasSiblings = grouping === "accountStructure" && siblingCount >= 1;
  const reorderLabel =
    grouping === "assetClass"
      ? "Switch to Account Structure to reorder siblings"
      : hasSiblings
        ? "Reorder Siblings"
        : "Cannot reorder because this row has no siblings";

  if (!data.isActive) {
    return (
      <ArchivedAccountTreeActionsCell
        unarchivePending={unarchivePending}
        reorderEnabled={hasSiblings}
        reorderLabel={reorderLabel}
        deleteLabel={
          getAccountConstraintMessage(
            data.deleteDisabledReason,
            isEquityTab ? "categories" : "accounts",
          ) ?? "Delete"
        }
        unarchiveLabel={
          getAccountConstraintMessage(
            data.unarchiveDisabledReason,
            isEquityTab ? "categories" : "accounts",
          ) ?? "Unarchive"
        }
        deletable={data.deletable}
        unarchivable={data.unarchivable}
        onEdit={() => onEditRow(data)}
        onDelete={() => onDeleteRow(toRowTarget(data))}
        onReorder={() =>
          onReorderRow({
            name: data.name,
            parentKey,
          })
        }
        onUnarchive={() => void onUnarchiveRow(data)}
      />
    );
  }

  return (
    <ActiveAccountTreeActionsCell
      addChildLabel={`Add Child to ${data.name}`}
      addAccountLabel={
        isEquityTab
          ? categoryType === "INCOME"
            ? "Add Income Category"
            : "Add Expense Category"
          : "Add Account"
      }
      onAddAccount={
        data.nodeType === "accountGroup" && onAddChild
          ? () => onAddChild(data, "account")
          : undefined
      }
      onAddGroup={
        data.nodeType === "accountGroup" && onAddChild
          ? () => onAddChild(data, "accountGroup")
          : undefined
      }
      archiveLabel={
        getAccountConstraintMessage(
          data.archiveDisabledReason,
          isEquityTab ? "categories" : "accounts",
        ) ?? "Archive"
      }
      deleteLabel={
        getAccountConstraintMessage(
          data.deleteDisabledReason,
          isEquityTab ? "categories" : "accounts",
        ) ?? "Delete"
      }
      archivable={data.archivable}
      deletable={data.deletable}
      reorderEnabled={hasSiblings}
      reorderLabel={reorderLabel}
      onEdit={() => onEditRow(data)}
      onArchive={() => onArchiveRow(toRowTarget(data))}
      onDelete={() => onDeleteRow(toRowTarget(data))}
      onReorder={() =>
        onReorderRow({
          name: data.name,
          parentKey,
        })
      }
    />
  );
}

export function buildAccountActionsColumn(
  params: AccountActionsParams,
  rowsByParentKeyRef: RefObject<Map<string, TreeRow[]>>,
): ColDef<AccountsGridRow> {
  return {
    colId: "actions",
    headerName: "",
    width: 170,
    pinned: "right",
    sortable: false,
    filter: false,
    resizable: false,
    suppressHeaderMenuButton: true,
    cellClass: "actions-cell",
    cellRenderer: ({ data }: ICellRendererParams<AccountsGridRow>) =>
      renderAccountRowActions({
        data,
        params,
        rowsByParentKey: rowsByParentKeyRef.current,
      }),
  };
}
