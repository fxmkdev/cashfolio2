import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import { getAccountConstraintMessage } from "@/shared/account-presentation";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import {
  ActiveAccountTreeActionsCell,
  ArchivedAccountTreeActionsCell,
} from "@/components/account-tree/account-tree-actions-cells";
import {
  isPersistedTreeRow,
  toRowTarget,
  type AccountsGridRow,
  type PersistedTreeRow,
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
type PersistedActionProps = {
  data: PersistedTreeRow;
  params: AccountActionsParams;
};

function constraintLabel(
  message: string | null | undefined,
  params: AccountActionsParams,
  fallback: string,
) {
  return (
    getAccountConstraintMessage(
      message,
      params.isEquityTab ? "categories" : "accounts",
    ) ?? fallback
  );
}
function commonActionProps({ data, params }: PersistedActionProps) {
  return {
    rowLabel: data.name,
    deletable: data.deletable,
    deleteLabel: constraintLabel(data.deleteDisabledReason, params, "Delete"),
    onEdit: () => params.onEditRow(data),
    onDelete: () => params.onDeleteRow(toRowTarget(data)),
  };
}
function renderArchivedActions(props: PersistedActionProps) {
  const { data, params } = props;
  return (
    <ArchivedAccountTreeActionsCell
      {...commonActionProps(props)}
      unarchivePending={params.unarchivePending}
      unarchiveLabel={constraintLabel(
        data.unarchiveDisabledReason,
        params,
        "Unarchive",
      )}
      unarchivable={data.unarchivable}
      onUnarchive={() => void params.onUnarchiveRow(data)}
    />
  );
}
function renderActiveActions(props: PersistedActionProps) {
  const { data, params } = props;
  const { isEquityTab, categoryType, onAddChild } = params;
  return (
    <ActiveAccountTreeActionsCell
      {...commonActionProps(props)}
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
      archiveLabel={constraintLabel(
        data.archiveDisabledReason,
        params,
        "Archive",
      )}
      archivable={data.archivable}
      onArchive={() => params.onArchiveRow(toRowTarget(data))}
    />
  );
}
function renderAccountRowActions(
  data: AccountsGridRow | undefined,
  params: AccountActionsParams,
) {
  if (!isPersistedTreeRow(data)) return null;
  return data.isActive
    ? renderActiveActions({ data, params })
    : renderArchivedActions({ data, params });
}
export function buildAccountActionsColumn(
  params: AccountActionsParams,
): ColDef<AccountsGridRow> {
  return {
    colId: "actions",
    ...rowActionsColumnProps,
    pinned: "right",
    cellRenderer: ({ data }: ICellRendererParams<AccountsGridRow>) =>
      renderAccountRowActions(data, params),
  };
}
