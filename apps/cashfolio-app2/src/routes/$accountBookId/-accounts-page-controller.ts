import { useCallback, useEffect, useMemo, useState } from "react";
import { useExpandedGroups } from "../../hooks/use-expanded-groups";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "../../components/edit-account-modal";
import type {
  AccountGroupInitialValues,
  AccountGroupTransformedFormValues,
} from "../../components/edit-account-group-modal";
import {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  getAccountTreeData,
  reorderAccountTreeItems,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "../../server/accounts";
import {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  getTabDefinition,
  tabs,
  type ReferenceCurrencyTotalFooterRow,
  type TreeRow,
} from "./-accounts-page-types";
import {
  useBalanceInReferenceCurrencyByGroupId,
  useReferenceCurrencyBalanceTotal,
  useRowsByParentKey,
  useSelectedSiblingRows,
} from "./-accounts-page-data";
import { useAccountTreeColumnDefs } from "./-accounts-page-columns";
import type { loadAccountsPageData } from "./-accounts-page-loader";
import type { AccountsPageViewProps } from "./-accounts-page-view";

type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;

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

type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

type AccountsMutationState = {
  getEditingAccount: () =>
    | { id: string; initialValues: AccountInitialValues }
    | undefined;
  getEditingGroup: () =>
    | { id: string; initialValues: AccountGroupInitialValues }
    | undefined;
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
}): AccountsPageViewProps {
  const {
    accountGroups,
    rows: loaderRows,
    existingNodes,
    referenceCurrency,
  } = args.loaderData;

  const [referenceBalanceByRowId, setReferenceBalanceByRowId] = useState(
    () => new Map<string, number | null>(),
  );
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editingAccount, setEditingAccount] = useState<
    { id: string; initialValues: AccountInitialValues } | undefined
  >();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createGroupModalOpened, setCreateGroupModalOpened] = useState(false);
  const [editingGroup, setEditingGroup] = useState<
    { id: string; initialValues: AccountGroupInitialValues } | undefined
  >();
  const [editGroupModalOpen, setEditGroupModalOpen] = useState(false);
  const [archivingRow, setArchivingRow] = useState<RowTarget | undefined>();
  const [deletingRow, setDeletingRow] = useState<RowTarget | undefined>();
  const [reorderingRow, setReorderingRow] = useState<
    { name: string; parentKey: string } | undefined
  >();

  const isEquityTab = args.tab.startsWith("EQUITY-");
  const isArchivedMode = args.mode === "archived";
  const loaderRowIdsKey = useMemo(
    () => loaderRows.map((row) => row.id).join("|"),
    [loaderRows],
  );

  const rows = useMemo(
    () =>
      loaderRows.map((row) => {
        if (!referenceBalanceByRowId.has(row.id)) {
          return row;
        }
        const referenceBalance = referenceBalanceByRowId.get(row.id) ?? null;
        if (referenceBalance === row.balanceInReferenceCurrency) {
          return row;
        }
        return {
          ...row,
          balanceInReferenceCurrency: referenceBalance,
        };
      }),
    [loaderRows, referenceBalanceByRowId],
  );

  useEffect(() => {
    setReferenceBalanceByRowId((previous) => {
      if (previous.size === 0) return previous;

      const next = new Map<string, number | null>();
      const rowIds = new Set(loaderRows.map((row) => row.id));
      for (const [rowId, balance] of previous.entries()) {
        if (rowIds.has(rowId)) {
          next.set(rowId, balance);
        }
      }
      return next;
    });
  }, [loaderRowIdsKey, loaderRows]);

  useEffect(() => {
    if (isEquityTab) {
      return;
    }

    const tabDefinition = getTabDefinition(args.tab);
    let active = true;

    void getAccountTreeData({
      data: {
        accountBookId: args.accountBookId,
        accountState: isArchivedMode ? "inactive" : "active",
        type: tabDefinition.type,
        ...("equityAccountSubtype" in tabDefinition
          ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
          : undefined),
        includeReferenceBalances: true,
      },
    })
      .then((treeData) => {
        if (!active) return;

        setReferenceBalanceByRowId((previous) => {
          const next = new Map(previous);
          for (const row of treeData.rows) {
            next.set(row.id, row.balanceInReferenceCurrency);
          }
          return next;
        });
      })
      .catch((error) => {
        console.error(
          "Unable to load reference-currency balances for accounts tab",
          error,
        );
      });

    return () => {
      active = false;
    };
  }, [
    args.accountBookId,
    args.tab,
    isArchivedMode,
    isEquityTab,
    loaderRowIdsKey,
  ]);

  const storageKey = `cashfolio:expandedGroups:${args.accountBookId}:${args.mode}:${args.tab}`;
  const { isGroupOpenByDefault, onRowGroupOpened } =
    useExpandedGroups(storageKey);

  const rowsByParentKey = useRowsByParentKey(rows);
  const selectedSiblingRows = useSelectedSiblingRows(
    rowsByParentKey,
    reorderingRow,
  );
  const balanceInReferenceCurrencyByGroupId =
    useBalanceInReferenceCurrencyByGroupId(rowsByParentKey, rows, !isEquityTab);
  const referenceCurrencyBalanceTotal = useReferenceCurrencyBalanceTotal(
    rows,
    !isEquityTab,
  );
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

  const handleEditRow = useCallback((data: TreeRow) => {
    if (data.nodeType === "account") {
      setEditingAccount({
        id: data.id,
        initialValues: {
          name: data.name,
          type: data.type,
          equityAccountSubtype: data.equityAccountSubtype,
          groupId: data.groupId ?? undefined,
          sortOrder: data.sortOrder ?? undefined,
          unit: data.unit,
          currency: data.currency,
          cryptocurrency: data.cryptocurrency,
          symbol: data.symbol,
          tradeCurrency: data.tradeCurrency,
        },
      });
      setEditModalOpen(true);
      return;
    }

    setEditingGroup({
      id: data.id,
      initialValues: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        parentGroupId: data.parentId,
        sortOrder: data.sortOrder ?? undefined,
      },
    });
    setEditGroupModalOpen(true);
  }, []);

  const actions = createAccountsMutationActions({
    accountBookId: args.accountBookId,
    invalidate: args.invalidate,
    state: {
      getEditingAccount: () => editingAccount,
      getEditingGroup: () => editingGroup,
      getDeletingRow: () => deletingRow,
      getArchivingRow: () => archivingRow,
      setCreateModalOpened,
      setEditModalOpen,
      setCreateGroupModalOpened,
      setEditGroupModalOpen,
      setDeletingRow,
      setArchivingRow,
    },
  });

  const columnDefs = useAccountTreeColumnDefs({
    isArchivedMode,
    isEquityTab,
    rowsByParentKey,
    referenceCurrency,
    balanceInReferenceCurrencyByGroupId,
    onEditRow: handleEditRow,
    onUnarchiveRow: actions.handleUnarchiveRow,
    onArchiveRow: setArchivingRow,
    onDeleteRow: setDeletingRow,
    onReorderRow: setReorderingRow,
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
    pinnedBottomRowData,
    isGroupOpenByDefault,
    onRowGroupOpened,
    createModalOpened,
    editModalOpen,
    createGroupModalOpened,
    editGroupModalOpen,
    editingAccount,
    editingGroup,
    deletingRow,
    archivingRow,
    reorderingRow,
    selectedSiblingRows,
    onOpenCreateGroup: () => setCreateGroupModalOpened(true),
    onOpenCreateAccount: () => setCreateModalOpened(true),
    onOpenLedger: args.onOpenLedger,
    onCloseCreateAccount: () => setCreateModalOpened(false),
    onSubmitCreateAccount: actions.handleCreateAccount,
    onCloseEditAccount: () => setEditModalOpen(false),
    onClearEditingAccount: () => setEditingAccount(undefined),
    onSubmitUpdateAccount: actions.handleUpdateAccount,
    onCloseCreateGroup: () => setCreateGroupModalOpened(false),
    onSubmitCreateGroup: actions.handleCreateGroup,
    onCloseEditGroup: () => setEditGroupModalOpen(false),
    onClearEditingGroup: () => setEditingGroup(undefined),
    onSubmitUpdateGroup: actions.handleUpdateGroup,
    onCloseDelete: () => setDeletingRow(undefined),
    onConfirmDelete: actions.handleDelete,
    onCloseArchive: () => setArchivingRow(undefined),
    onConfirmArchive: actions.handleArchive,
    onCloseReorder: () => setReorderingRow(undefined),
    onReorderSiblings: actions.handleReorderSiblings,
  };
}
