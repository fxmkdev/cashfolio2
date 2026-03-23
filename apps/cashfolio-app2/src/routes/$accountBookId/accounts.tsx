import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
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
  reorderAccountTreeItems,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "../../server/accounts";
import {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  type ReferenceCurrencyTotalFooterRow,
  parseAccountsSearch,
  tabs,
  type TabValue,
  type TreeRow,
} from "./accounts-page-types";
import { loadAccountsPageData } from "./accounts-page-loader";
import {
  useBalanceInReferenceCurrencyByGroupId,
  useReferenceCurrencyBalanceTotal,
  useRowsByParentKey,
  useSelectedSiblingRows,
} from "./accounts-page-data";
import { useAccountTreeColumnDefs } from "./accounts-page-columns";
import { AccountsPageView } from "./accounts-page-view";

export const Route = createFileRoute("/$accountBookId/accounts")({
  validateSearch: parseAccountsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode }),
  loader: async ({ params: { accountBookId }, deps: { mode } }) => {
    return loadAccountsPageData({ accountBookId, mode });
  },
  component: AccountsPage,
});

function AccountsPage() {
  const { accountGroups, treeData, existingNodes, referenceCurrency } =
    Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab, mode } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId/accounts" });
  const router = useRouter();
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
  const [archivingRow, setArchivingRow] = useState<
    | { id: string; nodeType: "account" | "accountGroup"; name: string }
    | undefined
  >();
  const [deletingRow, setDeletingRow] = useState<
    | { id: string; nodeType: "account" | "accountGroup"; name: string }
    | undefined
  >();
  const [reorderingRow, setReorderingRow] = useState<
    { name: string; parentKey: string } | undefined
  >();

  const isEquityTab = tab.startsWith("EQUITY-");
  const isArchivedMode = mode === "archived";

  const storageKey = `cashfolio:expandedGroups:${accountBookId}:${mode}:${tab}`;
  const { isGroupOpenByDefault, onRowGroupOpened } =
    useExpandedGroups(storageKey);

  const rowsByParentKey = useRowsByParentKey(treeData[tab]);
  const selectedSiblingRows = useSelectedSiblingRows(
    rowsByParentKey,
    reorderingRow,
  );
  const balanceInReferenceCurrencyByGroupId =
    useBalanceInReferenceCurrencyByGroupId(
      rowsByParentKey,
      treeData[tab],
      !isEquityTab,
    );
  const referenceCurrencyBalanceTotal = useReferenceCurrencyBalanceTotal(
    treeData[tab],
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
    } else if (data.nodeType === "accountGroup") {
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
    }
  }, []);

  const handleUnarchiveRow = useCallback(
    async (row: TreeRow) => {
      if (row.nodeType === "account") {
        await unarchiveAccount({ data: { id: row.id, accountBookId } });
      } else {
        await unarchiveAccountGroup({ data: { id: row.id, accountBookId } });
      }
      router.invalidate();
    },
    [accountBookId, router],
  );

  const columnDefs = useAccountTreeColumnDefs({
    isArchivedMode,
    isEquityTab,
    rowsByParentKey,
    referenceCurrency,
    balanceInReferenceCurrencyByGroupId,
    onEditRow: handleEditRow,
    onUnarchiveRow: handleUnarchiveRow,
    onArchiveRow: setArchivingRow,
    onDeleteRow: setDeletingRow,
    onReorderRow: setReorderingRow,
  });

  async function handleCreateAccount(values: TransformedFormValues) {
    await createAccount({
      data: {
        accountBookId,
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
    setCreateModalOpened(false);
    router.invalidate();
  }

  async function handleUpdateAccount(values: TransformedFormValues) {
    if (!editingAccount) return;
    await updateAccount({
      data: {
        id: editingAccount.id,
        accountBookId,
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
    setEditModalOpen(false);
    router.invalidate();
  }

  async function handleCreateGroup(values: AccountGroupTransformedFormValues) {
    await createAccountGroup({
      data: {
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        parentGroupId: values.parentGroupId,
        sortOrder: values.sortOrder,
      },
    });
    setCreateGroupModalOpened(false);
    router.invalidate();
  }

  async function handleDelete() {
    if (!deletingRow) return;
    if (deletingRow.nodeType === "account") {
      await deleteAccount({ data: { id: deletingRow.id, accountBookId } });
    } else {
      await deleteAccountGroup({ data: { id: deletingRow.id, accountBookId } });
    }
    setDeletingRow(undefined);
    router.invalidate();
  }

  async function handleArchive() {
    if (!archivingRow) return;
    if (archivingRow.nodeType === "account") {
      await archiveAccount({ data: { id: archivingRow.id, accountBookId } });
    } else {
      await archiveAccountGroup({
        data: { id: archivingRow.id, accountBookId },
      });
    }
    setArchivingRow(undefined);
    router.invalidate();
  }

  async function handleUpdateGroup(values: AccountGroupTransformedFormValues) {
    if (!editingGroup) return;
    await updateAccountGroup({
      data: {
        id: editingGroup.id,
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        parentGroupId: values.parentGroupId,
        sortOrder: values.sortOrder,
      },
    });
    setEditGroupModalOpen(false);
    router.invalidate();
  }

  async function handleReorderSiblings(
    rows: { id: string; nodeType: "account" | "accountGroup" }[],
  ) {
    await reorderAccountTreeItems({
      data: {
        accountBookId,
        updates: rows.map((row, i) => ({
          id: row.id,
          nodeType: row.nodeType,
          sortOrder: i,
        })),
      },
    });
    router.invalidate();
  }

  return (
    <AccountsPageView
      accountBookId={accountBookId}
      tab={tab}
      mode={mode}
      tabs={tabs}
      accountGroups={accountGroups}
      existingNodes={existingNodes}
      rows={treeData[tab]}
      columnDefs={columnDefs}
      pinnedBottomRowData={pinnedBottomRowData}
      isGroupOpenByDefault={isGroupOpenByDefault}
      onRowGroupOpened={onRowGroupOpened}
      createModalOpened={createModalOpened}
      editModalOpen={editModalOpen}
      createGroupModalOpened={createGroupModalOpened}
      editGroupModalOpen={editGroupModalOpen}
      editingAccount={editingAccount}
      editingGroup={editingGroup}
      deletingRow={deletingRow}
      archivingRow={archivingRow}
      reorderingRow={reorderingRow}
      selectedSiblingRows={selectedSiblingRows}
      onNavigateDashboard={() =>
        navigate({
          to: "/$accountBookId",
          params: { accountBookId },
        })
      }
      onNavigateArchive={() =>
        navigate({
          search: {
            tab,
            mode: "archived",
          },
        })
      }
      onTabChange={(nextTab) =>
        navigate({ search: { tab: nextTab as TabValue, mode } })
      }
      onOpenCreateGroup={() => setCreateGroupModalOpened(true)}
      onOpenCreateAccount={() => setCreateModalOpened(true)}
      onOpenLedger={(nextAccountId) =>
        navigate({
          to: "/$accountBookId/$accountId",
          params: { accountBookId, accountId: nextAccountId },
        })
      }
      onCloseCreateAccount={() => setCreateModalOpened(false)}
      onSubmitCreateAccount={handleCreateAccount}
      onCloseEditAccount={() => setEditModalOpen(false)}
      onClearEditingAccount={() => setEditingAccount(undefined)}
      onSubmitUpdateAccount={handleUpdateAccount}
      onCloseCreateGroup={() => setCreateGroupModalOpened(false)}
      onSubmitCreateGroup={handleCreateGroup}
      onCloseEditGroup={() => setEditGroupModalOpen(false)}
      onClearEditingGroup={() => setEditingGroup(undefined)}
      onSubmitUpdateGroup={handleUpdateGroup}
      onCloseDelete={() => setDeletingRow(undefined)}
      onConfirmDelete={handleDelete}
      onCloseArchive={() => setArchivingRow(undefined)}
      onConfirmArchive={handleArchive}
      onCloseReorder={() => setReorderingRow(undefined)}
      onReorderSiblings={handleReorderSiblings}
    />
  );
}
