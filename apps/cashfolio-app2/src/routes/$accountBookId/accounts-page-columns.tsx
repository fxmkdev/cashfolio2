import { useMemo } from "react";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import { Unit } from "../../.prisma-client/enums";
import { FORMATTED_NUMERIC_COLUMN } from "../../components/column-types";
import {
  ActiveAccountTreeActionsCell,
  ArchivedAccountTreeActionsCell,
} from "../../components/account-tree-actions-cells";
import type { GroupBalanceAggregation } from "./accounts-page-data";
import {
  ROOT_PARENT_KEY,
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  toRowTarget,
  type RowTarget,
  type TreeRow,
} from "./accounts-page-types";

export function useAccountTreeColumnDefs(params: {
  isArchivedMode: boolean;
  isEquityTab: boolean;
  rowsByParentKey: Map<string, TreeRow[]>;
  referenceCurrency: string;
  balanceInReferenceCurrencyByGroupId: Map<string, GroupBalanceAggregation>;
  onEditRow: (row: TreeRow) => void;
  onUnarchiveRow: (row: TreeRow) => Promise<void>;
  onArchiveRow: (row: RowTarget) => void;
  onDeleteRow: (row: RowTarget) => void;
  onReorderRow: (value: { name: string; parentKey: string }) => void;
}): ColDef<AccountsGridRow>[] {
  const {
    isArchivedMode,
    isEquityTab,
    rowsByParentKey,
    referenceCurrency,
    balanceInReferenceCurrencyByGroupId,
    onEditRow,
    onUnarchiveRow,
    onArchiveRow,
    onDeleteRow,
    onReorderRow,
  } = params;

  return useMemo<ColDef<AccountsGridRow>[]>(
    () => [
      ...(!isEquityTab
        ? [
            {
              colId: "currency",
              headerName: "Ccy.",
              filter: true,
              width: 100,
              valueGetter: ({
                data,
              }: {
                data: AccountsGridRow | undefined;
              }) => {
                if (!data || isReferenceCurrencyTotalFooterRow(data)) {
                  return undefined;
                }
                if (!data.unit) return undefined;
                switch (data.unit) {
                  case Unit.CURRENCY:
                    return data.currency;
                  case Unit.SECURITY:
                    return data.tradeCurrency;
                  case Unit.CRYPTOCURRENCY:
                    return data.cryptocurrency;
                }
              },
            } satisfies ColDef<AccountsGridRow>,
            {
              field: "symbol",
              filter: true,
              width: 120,
            } satisfies ColDef<AccountsGridRow>,
            {
              field: "balance",
              headerName: "Balance",
              width: 130,
              type: FORMATTED_NUMERIC_COLUMN,
              filter: "agNumberColumnFilter",
              valueGetter: ({
                data,
              }: {
                data: AccountsGridRow | undefined;
              }) => {
                if (
                  !data ||
                  isReferenceCurrencyTotalFooterRow(data) ||
                  data.nodeType !== "account"
                ) {
                  return null;
                }
                return data.balance;
              },
            } satisfies ColDef<AccountsGridRow>,
            {
              field: "balanceInReferenceCurrency",
              headerName: `Balance (${referenceCurrency})`,
              width: 170,
              type: FORMATTED_NUMERIC_COLUMN,
              filter: "agNumberColumnFilter",
              valueGetter: ({
                data,
              }: {
                data: AccountsGridRow | undefined;
              }) => {
                if (!data) return null;
                if (isReferenceCurrencyTotalFooterRow(data)) {
                  return data.balanceInReferenceCurrency;
                }
                if (data.nodeType === "account") {
                  return data.balanceInReferenceCurrency;
                }
                const groupAggregation =
                  balanceInReferenceCurrencyByGroupId.get(data.id);
                if (
                  !groupAggregation ||
                  !groupAggregation.hasAccountDescendants ||
                  groupAggregation.hasMissingReferenceBalance
                ) {
                  return null;
                }
                return groupAggregation.sum;
              },
            } satisfies ColDef<AccountsGridRow>,
          ]
        : []),
      {
        colId: "actions",
        headerName: "",
        width: isArchivedMode ? 50 : 145,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<AccountsGridRow>) => {
          if (!data) return null;
          if (isReferenceCurrencyTotalFooterRow(data)) return null;

          if (isArchivedMode) {
            return (
              <ArchivedAccountTreeActionsCell
                unarchiveLabel={data.unarchiveDisabledReason ?? "Unarchive"}
                unarchivable={data.unarchivable}
                onUnarchive={() => void onUnarchiveRow(data)}
              />
            );
          }

          const parentKey = data.parentId ?? ROOT_PARENT_KEY;
          const siblingCount =
            (rowsByParentKey.get(parentKey)?.length ?? 0) - 1;
          const hasSiblings = siblingCount >= 1;
          const reorderLabel = hasSiblings
            ? "Reorder siblings"
            : "Cannot reorder because this row has no siblings";

          return (
            <ActiveAccountTreeActionsCell
              archiveLabel={data.archiveDisabledReason ?? "Archive"}
              deleteLabel={data.deleteDisabledReason ?? "Delete"}
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
        },
      } satisfies ColDef<AccountsGridRow>,
    ],
    [
      isArchivedMode,
      isEquityTab,
      rowsByParentKey,
      referenceCurrency,
      balanceInReferenceCurrencyByGroupId,
      onEditRow,
      onUnarchiveRow,
      onArchiveRow,
      onDeleteRow,
      onReorderRow,
    ],
  );
}
