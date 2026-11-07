import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridApi } from "ag-grid-enterprise";
import type { AgGridReactProps } from "ag-grid-react";
import type { AccountsGridRow } from "./rows";
import type { BulkAccountActionOptions } from "../assignments/types";
import { isBulkAccount, isBulkAccountRow } from "../assignments/targets";
type SelectionOptions = Pick<
  BulkAccountActionOptions,
  "scopeKey" | "enabled" | "rows"
>;
type GridProps = Pick<
  AgGridReactProps<AccountsGridRow>,
  | "rowSelection"
  | "selectionColumnDef"
  | "onGridReady"
  | "onSelectionChanged"
  | "onFilterChanged"
  | "onRowDataUpdated"
>;

function bulkRowSelection(): GridProps["rowSelection"] {
  return {
    mode: "multiRow",
    selectAll: "filtered",
    enableClickSelection: false,
    groupSelects: "filteredDescendants",
    isRowSelectable: (node) => isBulkAccount(node.data),
    checkboxes: (params) => isBulkAccountRow(params.data),
  };
}

function selectedFilteredIds(api: GridApi<AccountsGridRow>) {
  const filteredIds = new Set<string>();
  api.forEachNodeAfterFilter((node) => {
    if (isBulkAccount(node.data)) filteredIds.add(node.data.id);
  });
  const hidden = api
    .getSelectedNodes()
    .filter((node) => !node.data || !filteredIds.has(node.data.id));
  if (hidden.length) api.setNodesSelected({ nodes: hidden, newValue: false });
  return api
    .getSelectedRows()
    .filter(isBulkAccount)
    .map((row) => row.id);
}

export function useBulkAccountSelection(args: SelectionOptions) {
  const apiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const clearSelection = useCallback(() => {
    apiRef.current?.deselectAll();
    setSelectedIds([]);
  }, []);
  useEffect(() => {
    clearSelection();
  }, [args.scopeKey, clearSelection]);
  const reconcileSelection = useCallback((api: GridApi<AccountsGridRow>) => {
    setSelectedIds(selectedFilteredIds(api));
  }, []);
  const rowSelection = useMemo(bulkRowSelection, []);
  const selectedIdSet = new Set(selectedIds);
  const selectedAccounts = args.rows
    .filter(isBulkAccount)
    .filter((row) => selectedIdSet.has(row.id));
  const gridProps: GridProps = args.enabled
    ? {
        rowSelection,
        selectionColumnDef: {
          pinned: "left",
          width: 48,
          resizable: false,
          suppressHeaderMenuButton: true,
        },
        onGridReady: ({ api }) => {
          apiRef.current = api;
        },
        onSelectionChanged: ({ api }) => reconcileSelection(api),
        onFilterChanged: ({ api }) => reconcileSelection(api),
        onRowDataUpdated: ({ api }) => reconcileSelection(api),
      }
    : {};
  return { gridProps, selectedAccounts, clearSelection };
}
