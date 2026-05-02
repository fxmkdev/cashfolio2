import type { GridApi, GridReadyEvent } from "ag-grid-enterprise";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useExpandedGroups } from "@/hooks/use-expanded-groups";
import type { TransformedFormValues } from "@/components/edit-account-modal";
import type { AccountGroupTransformedFormValues } from "@/components/edit-account-group-modal";
import {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  reorderAccountTreeItems,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "@/server/accounts";
import {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  type AccountsGridRow,
  tabs,
  type ReferenceCurrencyTotalFooterRow,
  type TreeRow,
} from "./-page-types";
import {
  useBalanceInReferenceCurrencyByGroupId,
  useReferenceCurrencyBalanceTotal,
  useRowsByParentKey,
  useSelectedSiblingRows,
} from "./-page-data";
import { type RowTarget, useAccountsPageModalState } from "./-page-modal-state";
import { useAccountsReferenceBalanceRows } from "./-page-reference-balances";
import { useAccountTreeColumnDefs } from "./-page-columns";
import type { loadAccountsPageData } from "./-page-loader";
import type { AccountsPageViewProps } from "./-page-view";

type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;
type AccountsPageControllerViewProps = Omit<
  AccountsPageViewProps,
  "accountBooks" | "currentAccountBookId" | "onSelectAccountBook"
>;

type AccountsMutationApi = {
  createAccount: typeof createAccount;
  updateAccount: typeof updateAccount;
  createAccountGroup: typeof createAccountGroup;
  updateAccountGroup: typeof updateAccountGroup;
  deleteAccount: typeof deleteAccount;
  deleteAccountGroup: typeof deleteAccountGroup;
  archiveAccount: typeof archiveAccount;
  archiveAccountGroup: typeof archiveAccountGroup;
  unarchiveAccount: typeof unarchiveAccount;
  unarchiveAccountGroup: typeof unarchiveAccountGroup;
  reorderAccountTreeItems: typeof reorderAccountTreeItems;
};

type AccountsMutationState = {
  getEditingAccount: () => ReturnType<
    typeof useAccountsPageModalState
  >["editingAccount"];
  getEditingGroup: () => ReturnType<
    typeof useAccountsPageModalState
  >["editingGroup"];
  getDeletingRow: () => RowTarget | undefined;
  getArchivingRow: () => RowTarget | undefined;
  setCreateModalOpened: (opened: boolean) => void;
  setEditModalOpen: (opened: boolean) => void;
  setCreateGroupModalOpened: (opened: boolean) => void;
  setEditGroupModalOpen: (opened: boolean) => void;
  setDeletingRow: (row: RowTarget | undefined) => void;
  setArchivingRow: (row: RowTarget | undefined) => void;
};

const defaultAccountsMutationApi: AccountsMutationApi = {
  createAccount,
  updateAccount,
  createAccountGroup,
  updateAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  archiveAccount,
  archiveAccountGroup,
  unarchiveAccount,
  unarchiveAccountGroup,
  reorderAccountTreeItems,
};

export function createAccountsMutationActions(args: {
  accountBookId: string;
  invalidate: () => void;
  state: AccountsMutationState;
  api?: AccountsMutationApi;
}) {
  const api = args.api ?? defaultAccountsMutationApi;

  return {
    async handleCreateAccount(values: TransformedFormValues) {
      await api.createAccount({
        data: {
          accountBookId: args.accountBookId,
          name: values.name!,
          type: values.type,
          equityAccountSubtype: values.equityAccountSubtype,
          groupId: values.groupId,
          sortOrder: values.sortOrder,
          unit: values.unit,
          currency: values.currency,
          cryptocurrency: values.cryptocurrency,
          symbol: values.symbol,
          tradeCurrency: values.tradeCurrency,
          openingBalance: values.openingBalance,
        },
      });
      args.state.setCreateModalOpened(false);
      args.invalidate();
    },

    async handleUpdateAccount(values: TransformedFormValues) {
      const editingAccount = args.state.getEditingAccount();
      if (!editingAccount) return;

      await api.updateAccount({
        data: {
          id: editingAccount.id,
          accountBookId: args.accountBookId,
          name: values.name!,
          type: values.type,
          equityAccountSubtype: values.equityAccountSubtype,
          groupId: values.groupId,
          sortOrder: values.sortOrder,
          unit: values.unit,
          currency: values.currency,
          cryptocurrency: values.cryptocurrency,
          symbol: values.symbol,
          tradeCurrency: values.tradeCurrency,
          openingBalance: values.openingBalance,
        },
      });
      args.state.setEditModalOpen(false);
      args.invalidate();
    },

    async handleCreateGroup(values: AccountGroupTransformedFormValues) {
      await api.createAccountGroup({
        data: {
          accountBookId: args.accountBookId,
          name: values.name!,
          type: values.type,
          equityAccountSubtype: values.equityAccountSubtype,
          parentGroupId: values.parentGroupId,
          sortOrder: values.sortOrder,
        },
      });
      args.state.setCreateGroupModalOpened(false);
      args.invalidate();
    },

    async handleUpdateGroup(values: AccountGroupTransformedFormValues) {
      const editingGroup = args.state.getEditingGroup();
      if (!editingGroup) return;

      await api.updateAccountGroup({
        data: {
          id: editingGroup.id,
          accountBookId: args.accountBookId,
          name: values.name!,
          type: values.type,
          equityAccountSubtype: values.equityAccountSubtype,
          parentGroupId: values.parentGroupId,
          sortOrder: values.sortOrder,
        },
      });
      args.state.setEditGroupModalOpen(false);
      args.invalidate();
    },

    async handleDelete() {
      const deletingRow = args.state.getDeletingRow();
      if (!deletingRow) return;

      if (deletingRow.nodeType === "account") {
        await api.deleteAccount({
          data: { id: deletingRow.id, accountBookId: args.accountBookId },
        });
      } else {
        await api.deleteAccountGroup({
          data: { id: deletingRow.id, accountBookId: args.accountBookId },
        });
      }

      args.state.setDeletingRow(undefined);
      args.invalidate();
    },

    async handleArchive() {
      const archivingRow = args.state.getArchivingRow();
      if (!archivingRow) return;

      if (archivingRow.nodeType === "account") {
        await api.archiveAccount({
          data: { id: archivingRow.id, accountBookId: args.accountBookId },
        });
      } else {
        await api.archiveAccountGroup({
          data: { id: archivingRow.id, accountBookId: args.accountBookId },
        });
      }

      args.state.setArchivingRow(undefined);
      args.invalidate();
    },

    async handleUnarchiveRow(row: TreeRow) {
      if (row.nodeType === "account") {
        await api.unarchiveAccount({
          data: { id: row.id, accountBookId: args.accountBookId },
        });
      } else {
        await api.unarchiveAccountGroup({
          data: { id: row.id, accountBookId: args.accountBookId },
        });
      }
      args.invalidate();
    },

    async handleReorderSiblings(
      rows: { id: string; nodeType: "account" | "accountGroup" }[],
    ) {
      await api.reorderAccountTreeItems({
        data: {
          accountBookId: args.accountBookId,
          updates: rows.map((row, i) => ({
            id: row.id,
            nodeType: row.nodeType,
            sortOrder: i,
          })),
        },
      });
      args.invalidate();
    },
  };
}

export function useAccountsPageController(args: {
  loaderData: AccountsPageLoaderData;
  accountBookId: string;
  tab: AccountsPageViewProps["tab"];
  mode: AccountsPageViewProps["mode"];
  invalidate: () => void;
  onOpenLedger: AccountsPageViewProps["onOpenLedger"];
}): AccountsPageControllerViewProps {
  const {
    accountGroups,
    rows: loaderRows,
    existingNodes,
    referenceCurrency,
  } = args.loaderData;

  const gridApiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const modalState = useAccountsPageModalState();
  const isArchivedMode = args.mode === "archived";
  const {
    isEquityTab,
    rowsWithAccountReferenceBalances,
    shouldShowReferenceBalancesLoading,
  } = useAccountsReferenceBalanceRows({
    accountBookId: args.accountBookId,
    tab: args.tab,
    mode: args.mode,
    referenceCurrency,
    rows: loaderRows,
  });

  const storageKey = `cashfolio:expandedGroups:${args.accountBookId}:${args.mode}:${args.tab}`;
  const { isGroupOpenByDefault, onRowGroupOpened } =
    useExpandedGroups(storageKey);

  const rowsByParentKeyForGroupAggregation = useRowsByParentKey(
    rowsWithAccountReferenceBalances,
  );
  const balanceInReferenceCurrencyByGroupId =
    useBalanceInReferenceCurrencyByGroupId(
      rowsByParentKeyForGroupAggregation,
      rowsWithAccountReferenceBalances,
      !isEquityTab,
    );
  const rows = useMemo(
    () =>
      rowsWithAccountReferenceBalances.map((row) => {
        if (row.nodeType !== "accountGroup") {
          return row;
        }

        const groupAggregation = balanceInReferenceCurrencyByGroupId.get(
          row.id,
        );
        const computedReferenceBalance =
          !groupAggregation ||
          !groupAggregation.hasAccountDescendants ||
          groupAggregation.hasMissingReferenceBalance
            ? null
            : groupAggregation.sum;

        if (row.balanceInReferenceCurrency === computedReferenceBalance) {
          return row;
        }

        return {
          ...row,
          balanceInReferenceCurrency: computedReferenceBalance,
        };
      }),
    [rowsWithAccountReferenceBalances, balanceInReferenceCurrencyByGroupId],
  );
  const rowsByParentKey = useRowsByParentKey(rows);
  const selectedSiblingRows = useSelectedSiblingRows(
    rowsByParentKey,
    modalState.reorderingRow,
  );
  const referenceCurrencyBalanceTotal = useReferenceCurrencyBalanceTotal(
    rows,
    !isEquityTab,
  );

  useEffect(() => {
    gridApiRef.current?.refreshCells({
      columns: ["balanceInReferenceCurrency"],
      force: true,
    });
  }, [shouldShowReferenceBalancesLoading]);

  const pinnedBottomRowData: ReferenceCurrencyTotalFooterRow[] | undefined =
    isEquityTab
      ? undefined
      : [
          {
            id: REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
            rowType: "referenceCurrencyTotalFooter",
            name: "Total",
            balanceInReferenceCurrency: referenceCurrencyBalanceTotal,
          },
        ];
  const handleGridReady = useCallback(
    (event: GridReadyEvent<AccountsGridRow>) => {
      gridApiRef.current = event.api;
    },
    [],
  );

  const actions = createAccountsMutationActions({
    accountBookId: args.accountBookId,
    invalidate: args.invalidate,
    state: {
      getEditingAccount: () => modalState.editingAccount,
      getEditingGroup: () => modalState.editingGroup,
      getDeletingRow: () => modalState.deletingRow,
      getArchivingRow: () => modalState.archivingRow,
      setCreateModalOpened: modalState.setCreateModalOpened,
      setEditModalOpen: modalState.setEditModalOpen,
      setCreateGroupModalOpened: modalState.setCreateGroupModalOpened,
      setEditGroupModalOpen: modalState.setEditGroupModalOpen,
      setDeletingRow: modalState.setDeletingRow,
      setArchivingRow: modalState.setArchivingRow,
    },
  });

  const columnDefs = useAccountTreeColumnDefs({
    isArchivedMode,
    isEquityTab,
    rowsByParentKey,
    referenceCurrency,
    isReferenceBalancesLoading: shouldShowReferenceBalancesLoading,
    balanceInReferenceCurrencyByGroupId,
    onEditRow: modalState.handleEditRow,
    onUnarchiveRow: actions.handleUnarchiveRow,
    onArchiveRow: modalState.setArchivingRow,
    onDeleteRow: modalState.setDeletingRow,
    onReorderRow: modalState.setReorderingRow,
  });

  return {
    accountBookId: args.accountBookId,
    tab: args.tab,
    mode: args.mode,
    tabs,
    accountGroups,
    existingNodes,
    rows,
    columnDefs,
    onGridReady: handleGridReady,
    pinnedBottomRowData,
    isGroupOpenByDefault,
    onRowGroupOpened,
    createModalOpened: modalState.createModalOpened,
    editModalOpen: modalState.editModalOpen,
    createGroupModalOpened: modalState.createGroupModalOpened,
    editGroupModalOpen: modalState.editGroupModalOpen,
    editingAccount: modalState.editingAccount,
    editingGroup: modalState.editingGroup,
    deletingRow: modalState.deletingRow,
    archivingRow: modalState.archivingRow,
    reorderingRow: modalState.reorderingRow,
    selectedSiblingRows,
    onOpenCreateGroup: () => modalState.setCreateGroupModalOpened(true),
    onOpenCreateAccount: () => modalState.setCreateModalOpened(true),
    onOpenLedger: args.onOpenLedger,
    onCloseCreateAccount: () => modalState.setCreateModalOpened(false),
    onSubmitCreateAccount: actions.handleCreateAccount,
    onCloseEditAccount: () => modalState.setEditModalOpen(false),
    onClearEditingAccount: () => modalState.setEditingAccount(undefined),
    onSubmitUpdateAccount: actions.handleUpdateAccount,
    onCloseCreateGroup: () => modalState.setCreateGroupModalOpened(false),
    onSubmitCreateGroup: actions.handleCreateGroup,
    onCloseEditGroup: () => modalState.setEditGroupModalOpen(false),
    onClearEditingGroup: () => modalState.setEditingGroup(undefined),
    onSubmitUpdateGroup: actions.handleUpdateGroup,
    onCloseDelete: () => modalState.setDeletingRow(undefined),
    onConfirmDelete: actions.handleDelete,
    onCloseArchive: () => modalState.setArchivingRow(undefined),
    onConfirmArchive: actions.handleArchive,
    onCloseReorder: () => modalState.setReorderingRow(undefined),
    onReorderSiblings: actions.handleReorderSiblings,
  };
}
