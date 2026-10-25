import type { MoveAccountsInput } from "@/shared/bulk-account-move";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgGridReactProps } from "ag-grid-react";
import type { GridApi } from "ag-grid-enterprise";
import type { AssetClass } from "@/.prisma-client/enums";
import { notifications } from "@mantine/notifications";
import type { AccountsGridRow, TreeRow } from "./-page-types";
import {
  createAccountBulkActionTarget,
  isBulkAccountRow,
  isBulkAccount,
  type AccountBulkActionTarget,
} from "./-bulk-account-targets";

export function useBulkAccountActions(args: {
  scopeKey: string;
  enabled: boolean;
  rows: TreeRow[];
  submitAssetClass: (
    accountIds: string[],
    assetClass: AssetClass | null,
  ) => Promise<unknown>;
  submitMove?: (
    data: Omit<MoveAccountsInput, "accountBookId" | "accountIds"> & {
      accountIds: string[];
    },
  ) => Promise<{ count: number }>;
  invalidate: () => void;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const apiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assetClassTarget, setAssetClassTarget] =
    useState<AccountBulkActionTarget>();
  const [moveTarget, setMoveTarget] = useState<AccountBulkActionTarget>();
  const clearSelection = useCallback(() => {
    apiRef.current?.deselectAll();
    setSelectedIds([]);
  }, []);
  useEffect(() => {
    clearSelection();
    setAssetClassTarget(undefined);
    setMoveTarget(undefined);
  }, [args.scopeKey, clearSelection]);

  const reconcileSelection = useCallback((api: GridApi<AccountsGridRow>) => {
    const filteredIds = new Set<string>();
    api.forEachNodeAfterFilter((node) => {
      if (isBulkAccount(node.data)) filteredIds.add(node.data.id);
    });
    const hidden = api
      .getSelectedNodes()
      .filter((node) => !node.data || !filteredIds.has(node.data.id));
    if (hidden.length) api.setNodesSelected({ nodes: hidden, newValue: false });
    setSelectedIds(
      api
        .getSelectedRows()
        .filter(isBulkAccount)
        .map((row) => row.id),
    );
  }, []);
  const selectedIdSet = new Set(selectedIds);
  const selectedAccounts = args.rows.filter(
    (row) => isBulkAccount(row) && selectedIdSet.has(row.id),
  );
  const rowSelection = useMemo<
    AgGridReactProps<AccountsGridRow>["rowSelection"]
  >(
    () => ({
      mode: "multiRow",
      selectAll: "filtered",
      enableClickSelection: false,
      groupSelects: "filteredDescendants",
      isRowSelectable: (node) => isBulkAccount(node.data),
      checkboxes: (params) => isBulkAccountRow(params.data),
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
    assetClassTarget,
    moveTarget,
    clearSelection,
    openAssetClass: () => {
      if (selectedAccounts.length)
        setAssetClassTarget(createAccountBulkActionTarget(selectedAccounts));
    },
    openMove: args.submitMove
      ? () => {
          if (selectedAccounts.length)
            setMoveTarget(createAccountBulkActionTarget(selectedAccounts));
        }
      : undefined,
    close: () => {
      setAssetClassTarget(undefined);
      setMoveTarget(undefined);
    },
    onRefreshConstraints: args.onRefreshConstraints,
    applyMove: async (
      data: Pick<
        MoveAccountsInput,
        "targetGroupId" | "expectedCashFlowChanges"
      >,
    ) => {
      if (!moveTarget || !args.submitMove) return;
      const result = await args.submitMove({
        ...data,
        accountIds: moveTarget.accountIds,
      });
      setMoveTarget(undefined);
      clearSelection();
      args.invalidate();
      notifications.show({
        color: "green",
        message: `${result.count} ${result.count === 1 ? "account" : "accounts"} moved.`,
      });
    },
    applyAssetClass: async (assetClass: AssetClass | null) => {
      if (!assetClassTarget) return;
      await args.submitAssetClass(assetClassTarget.accountIds, assetClass);
      setAssetClassTarget(undefined);
      clearSelection();
      args.invalidate();
      notifications.show({
        color: "green",
        message: `Asset class updated for ${assetClassTarget.accountIds.length} ${assetClassTarget.accountIds.length === 1 ? "account" : "accounts"}.`,
      });
    },
  };
}

export type BulkAccountActions = ReturnType<typeof useBulkAccountActions>;
