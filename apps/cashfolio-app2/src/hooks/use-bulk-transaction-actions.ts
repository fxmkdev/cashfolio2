import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridApi } from "ag-grid-enterprise";
import type { AgGridReactProps } from "ag-grid-react";
import { notifications } from "@mantine/notifications";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "@/shared/opening-balances";
import {
  getBulkRebookTargetOptions,
  getBulkTransactionIds,
  isBulkActionRowSelectable,
  type BulkActionRow,
  type BulkRebookBooking,
} from "@/shared/bulk-transaction-actions";
import type { AccountOption } from "@/shared/account-options";

export type BulkActionDialog =
  | { action: "delete"; transactionIds: string[] }
  | { action: "rebook"; bookings: BulkRebookBooking[] };

export type BulkTransactionActionState = {
  selectedCount: number;
  selectionLabel: "Bookings" | "Transactions";
  dialog: BulkActionDialog | undefined;
  dialogOpened: boolean;
  onExited: () => void;
  targetAccounts: AccountOption[];
  onClear: () => void;
  onDelete: () => void;
  onRebook?: () => void;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  onConfirmDelete: () => Promise<void>;
  onSubmitRebook: (values: { targetAccountId: string }) => Promise<void>;
};

export type BulkTransactionActions<T extends BulkActionRow> =
  BulkTransactionActionState & {
    gridProps: Pick<
      AgGridReactProps<T>,
      | "rowSelection"
      | "selectionColumnDef"
      | "onGridReady"
      | "onSelectionChanged"
      | "onFilterChanged"
      | "onRowDataUpdated"
    >;
  };

export function useBulkTransactionActions<T extends BulkActionRow>(args: {
  scopeKey: string;
  rows: T[];
  invalidate: () => void;
  onRefreshConstraints?: () => Promise<void>;
  deleteTransactions: (transactionIds: string[]) => Promise<void>;
  rebook?: {
    currentAccountId: string;
    accountOptions: AccountOption[];
    getBooking: (row: T) => BulkRebookBooking;
    submit: (bookingIds: string[], targetAccountId: string) => Promise<unknown>;
  };
}): BulkTransactionActions<T> {
  const apiRef = useRef<GridApi<T> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<BulkActionDialog>();
  const [dialogOpened, setDialogOpened] = useState(false);
  const selectedIdSet = new Set(selectedIds);
  const selectedRows = args.rows.filter(
    (row) => selectedIdSet.has(row.id) && isBulkActionRowSelectable(row),
  );

  const onClear = useCallback(() => {
    apiRef.current?.deselectAll();
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    onClear();
    setDialog(undefined);
    setDialogOpened(false);
  }, [args.scopeKey, onClear]);

  const reconcileSelection = useCallback((api: GridApi<T>) => {
    const visibleIds = new Set<string>();
    api.forEachNodeAfterFilter((node) => {
      if (isBulkActionRowSelectable(node.data)) visibleIds.add(node.data!.id);
    });
    const selectedNodes = api.getSelectedNodes();
    const hiddenNodes = selectedNodes.filter(
      (node) => !node.data || !visibleIds.has(node.data.id),
    );
    if (hiddenNodes.length)
      api.setNodesSelected({ nodes: hiddenNodes, newValue: false });
    setSelectedIds(
      api
        .getSelectedRows()
        .filter(isBulkActionRowSelectable)
        .map((row) => row.id),
    );
  }, []);

  const rowSelection = useMemo<AgGridReactProps<T>["rowSelection"]>(
    () => ({
      mode: "multiRow",
      selectAll: "filtered",
      enableClickSelection: false,
      isRowSelectable: (node) => isBulkActionRowSelectable(node.data),
      checkboxes: (params) => !params.data?.isVirtualCarryOver,
      hideDisabledCheckboxes: false,
    }),
    [],
  );

  const accountOptions = args.rebook?.accountOptions;
  const currentAccountId = args.rebook?.currentAccountId;
  const targetAccounts = useMemo(() => {
    if (dialog?.action !== "rebook" || !accountOptions || !currentAccountId)
      return [];
    return getBulkRebookTargetOptions({
      accountOptions,
      currentAccountId,
      bookings: dialog.bookings,
    });
  }, [accountOptions, currentAccountId, dialog]);

  function complete(message: string) {
    setDialogOpened(false);
    onClear();
    args.invalidate();
    notifications.show({ message, color: "green" });
  }

  return {
    selectedCount: selectedRows.length,
    selectionLabel: args.rebook ? "Bookings" : "Transactions",
    dialog,
    dialogOpened,
    onExited: () => {
      if (!dialogOpened) setDialog(undefined);
    },
    targetAccounts,
    onClear,
    onDelete: () => {
      setDialog({
        action: "delete",
        transactionIds: getBulkTransactionIds(selectedRows),
      });
      setDialogOpened(true);
    },
    onRebook: args.rebook
      ? () => {
          setDialog({
            action: "rebook",
            bookings: selectedRows.map(args.rebook!.getBooking),
          });
          setDialogOpened(true);
        }
      : undefined,
    onClose: () => setDialogOpened(false),
    onRefreshConstraints: args.onRefreshConstraints,
    onConfirmDelete: async () => {
      if (dialog?.action !== "delete") return;
      await args.deleteTransactions(dialog.transactionIds);
      const count = dialog.transactionIds.length;
      complete(
        `${count} ${count === 1 ? "transaction" : "transactions"} deleted.`,
      );
    },
    onSubmitRebook: async ({ targetAccountId }) => {
      if (dialog?.action !== "rebook") return;
      await args.rebook!.submit(
        dialog.bookings.map((booking) => booking.id),
        targetAccountId,
      );
      const count = dialog.bookings.length;
      complete(`${count} ${count === 1 ? "booking" : "bookings"} rebooked.`);
    },
    gridProps: {
      rowSelection,
      selectionColumnDef: {
        pinned: "left",
        width: 48,
        resizable: false,
        suppressHeaderMenuButton: true,
        tooltip: ({ data }) =>
          data?.isOpeningBalancesTransaction
            ? OPENING_BALANCES_MANAGEMENT_MESSAGE
            : undefined,
      },
      onGridReady: ({ api }) => {
        apiRef.current = api;
      },
      onSelectionChanged: ({ api }) => reconcileSelection(api),
      onFilterChanged: ({ api }) => reconcileSelection(api),
      onRowDataUpdated: ({ api }) => reconcileSelection(api),
    },
  };
}
