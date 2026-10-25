import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgGridReactProps } from "ag-grid-react";
import type { GridApi } from "ag-grid-enterprise";
import type { AssetClass } from "@/.prisma-client/enums";
import { notifications } from "@mantine/notifications";
import type { AccountsGridRow, TreeRow } from "./-page-types";
import {
  createAssetClassAssignmentTarget,
  getGroupAssetClassAccounts,
  isAssetClassAccount,
  type AssetClassAssignmentTarget,
} from "./-asset-class-targets";

export function useAssetClassAssignment(args: {
  scopeKey: string;
  enabled: boolean;
  rows: TreeRow[];
  submit: (
    accountIds: string[],
    assetClass: AssetClass | null,
  ) => Promise<unknown>;
  invalidate: () => void;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const apiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [target, setTarget] = useState<AssetClassAssignmentTarget>();
  const clearSelection = useCallback(() => {
    apiRef.current?.deselectAll();
    setSelectedIds([]);
  }, []);
  useEffect(() => {
    clearSelection();
    setTarget(undefined);
  }, [args.scopeKey, clearSelection]);

  const reconcileSelection = useCallback((api: GridApi<AccountsGridRow>) => {
    const filteredIds = new Set<string>();
    api.forEachNodeAfterFilter((node) => {
      if (isAssetClassAccount(node.data)) filteredIds.add(node.data.id);
    });
    const hidden = api
      .getSelectedNodes()
      .filter((node) => !node.data || !filteredIds.has(node.data.id));
    if (hidden.length) api.setNodesSelected({ nodes: hidden, newValue: false });
    setSelectedIds(
      api
        .getSelectedRows()
        .filter(isAssetClassAccount)
        .map((row) => row.id),
    );
  }, []);
  const selectedIdSet = new Set(selectedIds);
  const selectedAccounts = args.rows.filter(
    (row) => isAssetClassAccount(row) && selectedIdSet.has(row.id),
  );
  const rowSelection = useMemo<
    AgGridReactProps<AccountsGridRow>["rowSelection"]
  >(
    () => ({
      mode: "multiRow",
      selectAll: "filtered",
      enableClickSelection: false,
      groupSelects: "self",
      isRowSelectable: (node) => isAssetClassAccount(node.data),
      checkboxes: (params) => isAssetClassAccount(params.data),
    }),
    [],
  );
  const gridProps: Pick<
    AgGridReactProps<AccountsGridRow>,
    | "rowSelection"
    | "selectionColumnDef"
    | "onGridReady"
    | "onSelectionChanged"
    | "onFilterChanged"
    | "onRowDataUpdated"
  > = args.enabled
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

  return {
    gridProps,
    selectedCount: selectedAccounts.length,
    target,
    clearSelection,
    openSelected: () => {
      if (selectedAccounts.length)
        setTarget(createAssetClassAssignmentTarget(selectedAccounts));
    },
    openGroup: (group: TreeRow) => {
      const accounts = getGroupAssetClassAccounts(args.rows, group.id);
      if (accounts.length)
        setTarget(createAssetClassAssignmentTarget(accounts, group.name));
    },
    canAssignGroup: (group: TreeRow) =>
      getGroupAssetClassAccounts(args.rows, group.id).length > 0,
    close: () => setTarget(undefined),
    onRefreshConstraints: args.onRefreshConstraints,
    apply: async (assetClass: AssetClass | null) => {
      if (!target) return;
      await args.submit(target.accountIds, assetClass);
      setTarget(undefined);
      clearSelection();
      args.invalidate();
      notifications.show({
        color: "green",
        message: `Asset class updated for ${target.accountIds.length} ${target.accountIds.length === 1 ? "account" : "accounts"}.`,
      });
    },
  };
}

export type AssetClassAssignment = ReturnType<typeof useAssetClassAssignment>;
