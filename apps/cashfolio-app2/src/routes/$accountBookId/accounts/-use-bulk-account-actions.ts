import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgGridReactProps } from "ag-grid-react";
import type { GridApi } from "ag-grid-enterprise";

import { notifications } from "@mantine/notifications";
import type { AccountTrackingMethod } from "@/.prisma-client/enums";
import type { AccountsGridRow, TreeRow } from "./-page-types";
import {
  createAccountBulkActionTarget,
  createTrackingMethodBulkActionTarget,
  isTrackingMethodAccount,
  isBulkAccountRow,
  isBulkAccount,
  type AccountBulkActionTarget,
  type TrackingMethodBulkActionTarget,
} from "./-bulk-account-targets";

export function useBulkAccountActions(args: {
  scopeKey: string;
  enabled: boolean;
  rows: TreeRow[];
  submitAssetClass: (
    accountIds: string[],
    assetClassId: string | null,
  ) => Promise<unknown>;
  submitTrackingMethod: (
    accountIds: string[],
    trackingMethod: AccountTrackingMethod,
  ) => Promise<unknown>;
  invalidate: () => void;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const apiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assetClassTarget, setAssetClassTarget] =
    useState<AccountBulkActionTarget>();
  const [trackingMethodTarget, setTrackingMethodTarget] =
    useState<TrackingMethodBulkActionTarget>();
  const clearSelection = useCallback(() => {
    apiRef.current?.deselectAll();
    setSelectedIds([]);
  }, []);
  useEffect(() => {
    clearSelection();
    setAssetClassTarget(undefined);
    setTrackingMethodTarget(undefined);
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
    trackingMethodTarget,
    trackingMethodEligibleCount: selectedAccounts.filter(
      isTrackingMethodAccount,
    ).length,
    clearSelection,
    openAssetClass: () => {
      if (selectedAccounts.length)
        setAssetClassTarget(createAccountBulkActionTarget(selectedAccounts));
    },
    openTrackingMethod: () => {
      const target = createTrackingMethodBulkActionTarget(selectedAccounts);
      if (target.accountIds.length) setTrackingMethodTarget(target);
    },
    close: () => {
      setAssetClassTarget(undefined);
      setTrackingMethodTarget(undefined);
    },
    onRefreshConstraints: args.onRefreshConstraints,
    applyTrackingMethod: async (trackingMethod: AccountTrackingMethod) => {
      if (!trackingMethodTarget) return;
      await args.submitTrackingMethod(
        trackingMethodTarget.accountIds,
        trackingMethod,
      );
      setTrackingMethodTarget(undefined);
      clearSelection();
      args.invalidate();
      const count = trackingMethodTarget.accountIds.length;
      notifications.show({
        color: "green",
        message: `Tracking method updated for ${count} ${count === 1 ? "account" : "accounts"}.`,
      });
    },
    applyAssetClass: async (assetClassId: string | null) => {
      if (!assetClassTarget) return;
      await args.submitAssetClass(assetClassTarget.accountIds, assetClassId);
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
