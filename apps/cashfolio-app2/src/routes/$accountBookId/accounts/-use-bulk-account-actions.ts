import type { MoveAccountsInput } from "@/shared/bulk-account-move";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgGridReactProps } from "ag-grid-react";
import type { GridApi } from "ag-grid-enterprise";
import type { AssetClass } from "@/.prisma-client/enums";
import { notifications } from "@mantine/notifications";
import type { AccountsGridRow, TreeRow } from "./-page-types";
import { AccountSelectionHeader } from "./-account-selection-header";
import {
  createAccountBulkActionTarget,
  isBulkAccountRow,
  isBulkAccount,
  getBulkAccountGroupTargets,
  getBulkAccountSelectionSummary,
  reconcileBulkAccountSelection,
  type BulkAccountSelection,
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
  const selectionRef = useRef<BulkAccountSelection>(new Map());
  const reconciling = useRef(false);
  const [selection, setSelection] = useState<BulkAccountSelection>(new Map());
  const [assetClassTarget, setAssetClassTarget] =
    useState<AccountBulkActionTarget>();
  const [moveTarget, setMoveTarget] = useState<AccountBulkActionTarget>();
  const clearSelection = useCallback(() => {
    selectionRef.current = new Map();
    apiRef.current?.deselectAll();
    setSelection(new Map());
  }, []);
  useEffect(() => {
    clearSelection();
    setAssetClassTarget(undefined);
    setMoveTarget(undefined);
  }, [args.scopeKey, clearSelection]);

  const reconcileSelection = useCallback((api: GridApi<AccountsGridRow>) => {
    if (reconciling.current) return;
    const filteredRows: TreeRow[] = [];
    api.forEachNodeAfterFilter((node) => {
      if (node.data && !("rowType" in node.data)) filteredRows.push(node.data);
    });
    const selectedNodes = api.getSelectedNodes();
    const next = reconcileBulkAccountSelection(
      filteredRows,
      selectedNodes.flatMap((node) => (node.data ? [node.data.id] : [])),
      selectionRef.current,
    );
    selectionRef.current = next;
    const unavailable = selectedNodes.filter(
      (node) => !node.data || !next.has(node.data.id),
    );
    reconciling.current = true;
    try {
      if (unavailable.length)
        api.setNodesSelected({ nodes: unavailable, newValue: false });
    } finally {
      reconciling.current = false;
    }
    setSelection(next);
  }, []);
  const {
    accounts: selectedAccounts,
    selectedAccountCount,
    selectedGroupCount,
    canMove,
  } = getBulkAccountSelectionSummary(args.rows, selection);
  const groupTargets = useMemo(
    () => getBulkAccountGroupTargets(args.rows),
    [args.rows],
  );
  const rowSelection = useMemo<
    AgGridReactProps<AccountsGridRow>["rowSelection"]
  >(
    () => ({
      mode: "multiRow",
      headerCheckbox: false,
      enableClickSelection: false,
      groupSelects: "self",
      isRowSelectable: (node) =>
        isBulkAccount(node.data) ||
        (isBulkAccountRow(node.data) && groupTargets.has(node.data.id)),
      checkboxes: (params) => isBulkAccountRow(params.data),
    }),
    [groupTargets],
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
          headerComponent: AccountSelectionHeader,
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
    selectedAccountCount,
    selectedGroupCount,
    canMove,
    assetClassTarget,
    moveTarget,
    clearSelection,
    openAssetClass: () => {
      if (selectedAccounts.length)
        setAssetClassTarget(createAccountBulkActionTarget(selectedAccounts));
    },
    openMove: args.submitMove
      ? () => {
          if (canMove)
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
