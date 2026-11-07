import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import {
  ActiveAccountTreeActionsCell,
  ArchivedAccountTreeActionsCell,
} from "@/components/account-tree/account-tree-actions-cells";
import {
  isPersistedTreeRow,
  type AccountsGridRow,
  toRowTarget,
} from "./page-types";
import type { AccountTreeColumnParams } from "./account-column-types";
type AccountActionsParams = Pick<
  AccountTreeColumnParams,
  | "isEquityTab"
  | "categoryType"
  | "onEditRow"
  | "onAddChild"
  | "onUnarchiveRow"
  | "unarchivePending"
  | "onArchiveRow"
  | "onDeleteRow"
>;

function renderAccountRowActions({
  data,
  params,
}: {
  data: AccountsGridRow | undefined;
  params: AccountActionsParams;
}) {
  const {
    isEquityTab,
    categoryType,
    onEditRow,
    onAddChild,
    onUnarchiveRow,
    unarchivePending,
    onArchiveRow,
    onDeleteRow,
  } = params;
  if (!isPersistedTreeRow(data)) return null;

  if (!data.isActive) {
    return (
      <ArchivedAccountTreeActionsCell
        rowLabel={data.name}
        unarchivePending={unarchivePending}
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
        onUnarchive={() => void onUnarchiveRow(data)}
      />
    );
  }

  return (
    <ActiveAccountTreeActionsCell
      rowLabel={data.name}
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
      onEdit={() => onEditRow(data)}
      onArchive={() => onArchiveRow(toRowTarget(data))}
      onDelete={() => onDeleteRow(toRowTarget(data))}
    />
  );
}

export function buildAccountActionsColumn(
  params: AccountActionsParams,
): ColDef<AccountsGridRow> {
  return {
    colId: "actions",
    ...rowActionsColumnProps,
    pinned: "right",
    cellRenderer: ({ data }: ICellRendererParams<AccountsGridRow>) =>
      renderAccountRowActions({
        data,
        params,
      }),
  };
}
